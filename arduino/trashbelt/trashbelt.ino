/* =====================================================================
   Trashbelt — firmware do separador de recicláveis (ESP32)
   =====================================================================
   Um sensor de cores TCS34725 classifica o objeto na esteira
   (papel / plástico / vidro), o servo do destino correspondente abre e
   um sensor de obstáculos confirma a chegada do objeto antes de
   contabilizar. Os contadores ficam salvos na memória permanente (NVS,
   via Preferences) e sobrevivem a reinícios.

   Monitor Serial em 115200 baud. Comandos: STATUS, ZERAR, AJUDA.

   Bibliotecas (Library Manager do Arduino IDE):
     • Adafruit TCS34725   — instale aceitando as dependências sugeridas
     • ESP32Servo
   "Wire" e "Preferences" já vêm com o núcleo ESP32.
   Placa: ESP32 Dev Module (instale "esp32 by Espressif" no Boards Manager).
   ===================================================================== */

#include <Wire.h>
#include <Adafruit_TCS34725.h>
#include <ESP32Servo.h>
#include <Preferences.h>
#include <ctype.h>
#include <string.h>

// ==================================================
// PINOS
// ==================================================

#define SDA_TCS 23
#define SCL_TCS 22

const int pinosServos[3] = {
  18, // Papel
  19, // Plastico
  21  // Vidro
};

const int pinosObstaculos[3] = {
  27, // Papel
  26, // Plastico
  25  // Vidro
};

// ==================================================
// CONFIGURACOES
// ==================================================

#define MIN_CLEAR 130

const unsigned long TEMPO_LIMITE = 10000;
const unsigned long DEBOUNCE_MS = 60;

const int ANGULO_FECHADO = 0;
const int ANGULO_ABERTO = 90;

// Destinos
enum {
  NENHUM = -1,
  PAPEL = 0,
  PLASTICO = 1,
  VIDRO = 2
};

// ==================================================
// COMPONENTES
// ==================================================

Adafruit_TCS34725 tcs(
  TCS34725_INTEGRATIONTIME_50MS,
  TCS34725_GAIN_4X
);

Servo servos[3];

Preferences preferencias;

// ==================================================
// CONTADORES
// ==================================================

uint32_t totalObjetos = 0;
uint32_t totalPapel = 0;
uint32_t totalPlastico = 0;
uint32_t totalVidro = 0;

// ==================================================
// CONTROLE DO SISTEMA
// ==================================================

int destinoPendente = NENHUM;

bool aguardandoSaidaSensorCor = false;
bool sensorDestinoArmado = false;

unsigned long inicioDestino = 0;
unsigned long inicioDeteccao = 0;

// Buffer do Monitor Serial
char comando[32];
byte indiceComando = 0;

// ==================================================
// ARMAZENAMENTO
// ==================================================

void salvarContadores() {

  bool sucesso = true;

  if (preferencias.putUInt("total", totalObjetos) == 0)
    sucesso = false;

  if (preferencias.putUInt("papel", totalPapel) == 0)
    sucesso = false;

  if (preferencias.putUInt("plastico", totalPlastico) == 0)
    sucesso = false;

  if (preferencias.putUInt("vidro", totalVidro) == 0)
    sucesso = false;

  if (sucesso) {
    Serial.println("Contadores salvos na memoria.");
  } else {
    Serial.println("ERRO ao salvar contadores!");
  }
}

void carregarContadores() {

  totalObjetos = preferencias.getUInt("total", 0);
  totalPapel = preferencias.getUInt("papel", 0);
  totalPlastico = preferencias.getUInt("plastico", 0);
  totalVidro = preferencias.getUInt("vidro", 0);

  Serial.println("\nContadores recuperados:");
  Serial.print("Total: ");
  Serial.println(totalObjetos);
}

// ==================================================
// STATUS
// ==================================================

void imprimirStatus() {

  Serial.println("\n========== TRASH BELT ==========");

  Serial.print("Total de objetos: ");
  Serial.println(totalObjetos);

  Serial.print("Papel: ");
  Serial.println(totalPapel);

  Serial.print("Plastico: ");
  Serial.println(totalPlastico);

  Serial.print("Vidro: ");
  Serial.println(totalVidro);

  Serial.println("================================");
}

// ==================================================
// REGISTRAR OBJETO
// ==================================================

void registrarObjeto(int destino) {

  totalObjetos++;

  switch (destino) {

    case PAPEL:
      totalPapel++;
      Serial.println("Objeto registrado: PAPEL");
      break;

    case PLASTICO:
      totalPlastico++;
      Serial.println("Objeto registrado: PLASTICO");
      break;

    case VIDRO:
      totalVidro++;
      Serial.println("Objeto registrado: VIDRO");
      break;
  }

  salvarContadores();
  imprimirStatus();
}

// ==================================================
// CLASSIFICACAO DE CORES
// ==================================================

int identificarMaterial(
  uint16_t r,
  uint16_t g,
  uint16_t b,
  uint16_t c
) {

  if (c < MIN_CLEAR) {
    return NENHUM;
  }

  if (r == 0 || g == 0 || b == 0) {
    return NENHUM;
  }

  float proporcaoBR = (float)b / r;
  float proporcaoGR = (float)g / r;
  float proporcaoGB = (float)g / b;

  Serial.println("\n--- Leitura do objeto ---");

  Serial.print("R: ");
  Serial.print(r);

  Serial.print(" | G: ");
  Serial.print(g);

  Serial.print(" | B: ");
  Serial.print(b);

  Serial.print(" | Clear: ");
  Serial.println(c);

  Serial.print("G/R: ");
  Serial.println(proporcaoGR);

  Serial.print("G/B: ");
  Serial.println(proporcaoGB);

  Serial.print("B/R: ");
  Serial.println(proporcaoBR);

  // VERDE / VIDRO
  // Prioriza o verde-escuro identificado nos testes.
  if (proporcaoGR >= 1.50 &&
      proporcaoGB >= 1.20) {

    return VIDRO;
  }

  // Outra faixa de identificacao do verde
  if (proporcaoBR <= 0.55 &&
      proporcaoGR >= 0.80) {

    return VIDRO;
  }

  // AZUL / PLASTICO
  if (proporcaoBR >= 0.78 &&
      proporcaoGR < 1.50) {

    return PLASTICO;
  }

  // BRANCO / PAPEL
  if (proporcaoBR >= 0.56 &&
      proporcaoBR <= 0.75) {

    return PAPEL;
  }

  return NENHUM;
}

// ==================================================
// ABRIR DESTINO
// ==================================================

void abrirDestino(int destino) {

  destinoPendente = destino;

  servos[destino].write(ANGULO_ABERTO);

  inicioDestino = millis();
  inicioDeteccao = 0;

  sensorDestinoArmado =
    digitalRead(pinosObstaculos[destino]) == HIGH;

  Serial.print("Destino identificado: ");

  if (destino == PAPEL)
    Serial.println("PAPEL");

  else if (destino == PLASTICO)
    Serial.println("PLASTICO");

  else if (destino == VIDRO)
    Serial.println("VIDRO");

  Serial.println("Servo aberto.");
}

// ==================================================
// FINALIZAR DESTINO
// ==================================================

void finalizarDestino(bool timeout) {

  if (destinoPendente == NENHUM) {
    return;
  }

  int destino = destinoPendente;

  servos[destino].write(ANGULO_FECHADO);

  if (timeout) {

    Serial.println(
      "TEMPO ESGOTADO: objeto nao contabilizado."
    );

  } else {

    Serial.println("Objeto chegou ao destino!");
    registrarObjeto(destino);
  }

  destinoPendente = NENHUM;
  sensorDestinoArmado = false;
  inicioDeteccao = 0;
}

// ==================================================
// VERIFICAR SENSOR DE DESTINO
// ==================================================

void verificarDestino() {

  if (destinoPendente == NENHUM) {
    return;
  }

  int leitura =
    digitalRead(pinosObstaculos[destinoPendente]);

  // Aguarda o sensor ficar livre antes de aceitar
  // uma nova deteccao.
  if (!sensorDestinoArmado) {

    if (leitura == HIGH) {
      sensorDestinoArmado = true;
    }

  } else {

    if (leitura == LOW) {

      if (inicioDeteccao == 0) {
        inicioDeteccao = millis();
      }

      if (millis() - inicioDeteccao >= DEBOUNCE_MS) {
        finalizarDestino(false);
        return;
      }

    } else {

      inicioDeteccao = 0;
    }
  }

  // Verifica o tempo limite
  if (destinoPendente != NENHUM &&
      millis() - inicioDestino >= TEMPO_LIMITE) {

    finalizarDestino(true);
  }
}

// ==================================================
// COMANDOS SERIAL
// ==================================================

void mostrarAjuda() {

  Serial.println("\nCOMANDOS DISPONIVEIS:");

  Serial.println("STATUS - Mostra os contadores");
  Serial.println("ZERAR  - Zera todos os contadores");
  Serial.println("AJUDA  - Mostra os comandos");
}

void processarComando(char *texto) {

  if (strcmp(texto, "STATUS") == 0) {

    imprimirStatus();

  } else if (strcmp(texto, "ZERAR") == 0) {

    totalObjetos = 0;
    totalPapel = 0;
    totalPlastico = 0;
    totalVidro = 0;

    salvarContadores();

    Serial.println("Todos os contadores foram zerados.");

    imprimirStatus();

  } else if (strcmp(texto, "AJUDA") == 0) {

    mostrarAjuda();

  } else if (strlen(texto) > 0) {

    Serial.println("Comando desconhecido. Digite AJUDA.");
  }
}

void verificarSerial() {

  while (Serial.available()) {

    char caractere = Serial.read();

    if (caractere == '\r') {
      continue;
    }

    if (caractere == '\n') {

      comando[indiceComando] = '\0';

      processarComando(comando);

      indiceComando = 0;

    } else if (indiceComando < sizeof(comando) - 1) {

      comando[indiceComando++] =
        toupper((unsigned char)caractere);
    }
  }
}

// ==================================================
// SETUP
// ==================================================

void setup() {

  Serial.begin(115200);

  delay(1000);

  Serial.println("\nInicializando TRASH BELT...");

  // Memoria permanente
  if (!preferencias.begin("TrashBelt", false)) {

    Serial.println("ERRO ao iniciar memoria Preferences!");

    while (true) {
      delay(1000);
    }
  }

  carregarContadores();

  // Sensor de cores
  Wire.begin(SDA_TCS, SCL_TCS);

  if (!tcs.begin()) {

    Serial.println("ERRO: TCS34725 nao encontrado!");

    while (true) {
      delay(1000);
    }
  }

  Serial.println("Sensor TCS34725 iniciado.");

  // Sensores de obstaculos
  for (int i = 0; i < 3; i++) {

    pinMode(pinosObstaculos[i], INPUT_PULLUP);
  }

  // Servomotores
  for (int i = 0; i < 3; i++) {

    servos[i].setPeriodHertz(50);

    servos[i].attach(
      pinosServos[i],
      500,
      2400
    );

    servos[i].write(ANGULO_FECHADO);
  }

  Serial.println("Servomotores iniciados.");

  mostrarAjuda();
  imprimirStatus();

  Serial.println("\nTRASH BELT PRONTO!");
}

// ==================================================
// LOOP PRINCIPAL
// ==================================================

void loop() {

  verificarSerial();

  uint16_t r, g, b, c;

  tcs.getRawData(&r, &g, &b, &c);

  // Libera a leitura para o proximo objeto
  // quando o objeto anterior sai da area do sensor.
  if (c < MIN_CLEAR) {

    aguardandoSaidaSensorCor = false;
  }

  // Identifica um novo objeto somente quando
  // nao existe outro destino pendente.
  if (c >= MIN_CLEAR &&
      !aguardandoSaidaSensorCor &&
      destinoPendente == NENHUM) {

    aguardandoSaidaSensorCor = true;

    int material = identificarMaterial(r, g, b, c);

    if (material == NENHUM) {

      Serial.println(
        "Material nao identificado. Objeto ignorado."
      );

    } else {

      abrirDestino(material);
    }
  }

  // Confirma a chegada do objeto ao destino
  verificarDestino();

  delay(20);
}
