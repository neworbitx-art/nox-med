/** Fully synthetic ABL90-style report text used by the "Load synthetic example" button. Invented values; no real patient data. */
export const SYNTHETIC_REPORT_TEXT = `
ABL90 SERIES
ABL90 SYNTHETIC-UNIT-0001
INFORME PACIENTE Jeringa - J 65uL
09:05 AM 03/21/2026 Muestra # 00001
Identificadores
ID paciente SYN-A
Nombre de paciente SYN-A
Tipo muestra Venosa
T 37.0 °C
FO2(I) 21.0 %
Valores de Gases en Sangre
↓ pH 7.312 [ 7.350 - 7.450 ]
↑ pCO2 52.1 mmHg [ 32.0 - 48.0 ]
↓ pO2 41.0 mmHg [ 83.0 - 108.0 ]
Valores de Oximetría
tHb 13.9 g/dL [ 12.0 - 17.5 ]
sO2 72.0 % [ 95.0 - 99.0 ]
FO2Hb 70.9 % [ 94.0 - 98.0 ]
FCOHb 0.9 % [ 0.5 - 1.5 ]
FHHb 28.0 % [ - ]
FMetHb 0.2 % [ 0.0 - 1.5 ]
Valores de electrólitos y metabolitos
cK+ 4.0 mmol/L [ 3.4 - 4.5 ]
cNa+ 139 mmol/L [ 136 - 146 ]
cCa2+ 1.18 mmol/L [ 1.15 - 1.29 ]
cCl- 103 mmol/L [ 98 - 106 ]
Valores de Metabolitos
? cGlu 95 mg/dL [ 70 - 105 ]
? cLac 1.1 mmol/L [ 0.5 - 1.6 ]
ctBil 0.0 mg/dL [ - ]
Valores Corregidos por Temp.
pH(T) 7.312
pCO2(T) 52.1 mmHg
pO2(T) 41.0 mmHg
Estado de Oxigenación
ctO2c 15.0 Vol%
p50c 26.80 mmHg
Valores Calculados
cBase(Ecf)c -1.9 mmol/L
cHCO3-(P,st)c 24.8 mmol/L
Anion Gapc 11.1 mmol/L
Anion Gap,K+c 15.1 mmol/L
cCa2+ 1.17 mmol/L
Hctc 42.5 %
Notas
c Valores calculados
cGlu 0210: Presencia de error(es) de calibración
cLac 0210: Presencia de error(es) de calibración
`.trim();
