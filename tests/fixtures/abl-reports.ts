/** Synthetic ABL90-style report text. Values and identifiers are invented; no real patient data. */
export const ES_VENOUS = `
ABL90 SERIES
ABL90 SYNTHETIC-UNIT-0001
INFORME PACIENTE Jeringa - J 65uL
09:05 AM 03/21/2031 Muestra # 00001
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
`;

export const EN_ARTERIAL = `
ABL90 FLEX
Patient Report
2031-03-22 14:30
Patient ID SYN-B
Sample type Arterial
T 36.8 °C
FiO2 40.0 %
Blood Gas Values
pH 7.401
pCO2 5.3 kPa
pO2 14.0 kPa
Oximetry Values
ctHb 140 g/L
sO2 98.1 %
FCOHb 0.8 %
FMetHb 0.5 %
Electrolyte Values
cK+ 4.1 mmol/L
cNa+ 140 mmol/L
Metabolite Values
cLac 0.9 mmol/L
cGlu 5.0 mmol/L
Calculated Values
cBase(Ecf)c 0.2 mmol/L
cHCO3-(P,st)c 24.1 mmol/L
Hctc 0.43 L/L
`;

/** Text-only output with no recognizable analytes, like a failed OCR */
export const GARBAGE = `
xx1 ;; pHH 7.5Z ???
lorem ipsum dolor
`;
