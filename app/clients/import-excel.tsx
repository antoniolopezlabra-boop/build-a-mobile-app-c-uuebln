// ══════════════════════════════════════════════════════════════════
// import-excel.tsx — Tercer método para subir clientes: archivo Excel/CSV.
//
// Flujo (asistente de 3 pasos):
//   1. Descargar plantilla (.xlsx con hoja "Clientes" + "Instrucciones").
//   2. Subir el archivo lleno (.xlsx o .csv).
//   3. Vista previa con validación → confirmar → inserción en lote.
//
// La lógica de parseo/validación/dedup vive en @/utils/clientImport (pura,
// testeada). Aquí solo: leer archivo, generar plantilla, UI y guardado.
// ══════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '@/contexts/ThemeContext';
import { colors } from '@/styles/commonStyles';
import { apiGet, apiPost } from '@/utils/api';
import { invalidateCache } from '@/utils/cache';
import { logger } from '@/utils/logger';
import { analyzeRows, ImportAnalysis, RowResult } from '@/utils/clientImport';

const ACCENT = '#1D6F42'; // verde "hoja de cálculo"

const TEMPLATE_HEADERS = ['Nombre completo', 'Teléfono', 'Correo electrónico', 'Fecha de nacimiento'];
const TEMPLATE_EXAMPLE = ['Juan Pérez (ejemplo)', '5512345678', 'juan@correo.com', '1990-05-15'];

type Phase = 'intro' | 'preview' | 'importing' | 'done';

export default function ImportExcelScreen() {
  const router = useRouter();
  const { colors: tc, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('intro');
  const [generating, setGenerating] = useState(false);
  const [reading, setReading] = useState(false);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState({ imported: 0, failed: 0 });

  // ── Paso 1: generar y compartir la plantilla ──────────────────
  const downloadTemplate = async () => {
    try {
      setGenerating(true);

      const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE]);
      ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 26 }, { wch: 22 }];

      const instrucciones = [
        ['Cómo llenar esta plantilla'],
        [''],
        ['1. Escribe un cliente por fila, debajo de los encabezados.'],
        ['2. Borra la fila de ejemplo antes de subir (o déjala, la ignoramos).'],
        ['3. Obligatorios: Nombre completo y Teléfono.'],
        ['4. Teléfono: 10 dígitos. Puedes escribirlo con o sin lada, con'],
        ['   espacios o guiones — nosotros lo ordenamos.'],
        ['5. Correo y Fecha de nacimiento son opcionales.'],
        ['6. Fecha de nacimiento en formato AAAA-MM-DD (ej. 1990-05-15)'],
        ['   o DD/MM/AAAA (ej. 15/05/1990).'],
        ['7. Guarda el archivo y súbelo en VYLTA: Clientes → Importar → Excel.'],
        [''],
        ['Puedes guardar como Excel (.xlsx) o CSV — ambos funcionan.'],
      ];
      const wsI = XLSX.utils.aoa_to_sheet(instrucciones);
      wsI['!cols'] = [{ wch: 64 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
      XLSX.utils.book_append_sheet(wb, wsI, 'Instrucciones');

      const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const uri = `${FileSystem.cacheDirectory}plantilla-clientes-vylta.xlsx`;
      await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('No disponible', 'No se pudo abrir el menú para guardar el archivo en este dispositivo.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Guardar plantilla de clientes VYLTA',
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
      });
    } catch (e) {
      logger.error('[ImportExcel] downloadTemplate failed:', e);
      Alert.alert('Error', 'No pudimos generar la plantilla. Intenta de nuevo.');
    } finally {
      setGenerating(false);
    }
  };

  // ── Paso 2: elegir archivo y analizarlo ─────────────────────
  const pickAndAnalyze = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'text/comma-separated-values',
          'application/csv',
          '*/*',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (picked.canceled || !picked.assets || picked.assets.length === 0) return;

      setReading(true);
      const asset = picked.assets[0];
      setFileName(asset.name || 'archivo');

      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = XLSX.read(b64, { type: 'base64', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

      if (!matrix || matrix.length < 2) {
        Alert.alert('Archivo vacío', 'No encontramos clientes en el archivo. Revisa que llenaste la primera hoja.');
        setReading(false);
        return;
      }

      // Teléfonos ya guardados (para no duplicar)
      const existing = await apiGet<any[]>('/api/clients').catch(() => []);
      const existingPhones = (existing || []).map((c: any) => c.phone || '');

      const result = analyzeRows(matrix, existingPhones);

      if (result.total === 0) {
        Alert.alert('Sin clientes', 'No encontramos filas con datos para importar.');
        setReading(false);
        return;
      }

      setAnalysis(result);
      setPhase('preview');
    } catch (e) {
      logger.error('[ImportExcel] pickAndAnalyze failed:', e);
      Alert.alert(
        'No pudimos leer el archivo',
        'Asegúrate de que sea el archivo de la plantilla (.xlsx o .csv) y vuelve a intentarlo.'
      );
    } finally {
      setReading(false);
    }
  };

  // ── Paso 3: confirmar e insertar ─────────────────────────
  const confirmImport = async () => {
    if (!analysis || analysis.okCount === 0) return;
    setPhase('importing');
    setProgress({ done: 0, total: analysis.okCount });

    let imported = 0;
    let failed = 0;

    for (const r of analysis.okResults) {
      try {
        await apiPost('/api/clients', r.client);
        imported++;
      } catch (e: any) {
        const msg = (e?.message || '').toLowerCase();
        // Si la API lo marca duplicado, no es un error real: lo contamos como omitido.
        if (!(msg.includes('duplicate') || msg.includes('exist') || msg.includes('unique') || e?.status === 409 || e?.status === 422)) {
          failed++;
          logger.error('[ImportExcel] insert failed:', r.client?.name, e?.message);
        }
      }
      setProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }

    invalidateCache('clients_list');
    setResult({ imported, failed });
    setPhase('done');
  };

  // ── Render por fase ────────────────────────────────────
  const renderIntro = () => (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={[s.hero, { backgroundColor: isDark ? '#04231A' : '#ECFDF5', borderColor: isDark ? '#0B5138' : '#A7F3D0' }]}>
        <View style={[s.heroIcon, { backgroundColor: ACCENT + '22' }]}>
          <MaterialIcons name="grid-on" size={26} color={ACCENT} />
        </View>
        <Text style={[s.heroTitle, { color: tc.text }]}>Importar desde Excel</Text>
        <Text style={[s.heroDesc, { color: tc.textMuted }]}>
          Ideal si ya tienes tu lista de clientes en una hoja de cálculo. Descarga la plantilla, llénala y súbela.
        </Text>
      </View>

      {[
        { n: '1', icon: 'download', title: 'Descarga la plantilla', desc: 'Un archivo con las columnas listas: nombre, teléfono, correo y cumpleaños.' },
        { n: '2', icon: 'edit', title: 'Llena tus clientes', desc: 'Un cliente por fila. Solo nombre y teléfono son obligatorios.' },
        { n: '3', icon: 'cloud-upload', title: 'Súbela aquí', desc: 'Revisamos todo, te mostramos un resumen y guardamos a tus clientes.' },
      ].map(step => (
        <View key={step.n} style={[s.stepRow, { borderColor: tc.border, backgroundColor: tc.surface }]}>
          <View style={[s.stepNum, { backgroundColor: ACCENT + '18' }]}>
            <Text style={[s.stepNumText, { color: ACCENT }]}>{step.n}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.stepTitle, { color: tc.text }]}>{step.title}</Text>
            <Text style={[s.stepDesc, { color: tc.textMuted }]}>{step.desc}</Text>
          </View>
          <MaterialIcons name={step.icon as any} size={22} color={tc.textMuted} />
        </View>
      ))}

      <TouchableOpacity
        style={[s.btnPrimary, { backgroundColor: ACCENT }]}
        onPress={downloadTemplate}
        disabled={generating}
        activeOpacity={0.8}
      >
        {generating
          ? <ActivityIndicator color="#fff" />
          : <><MaterialIcons name="download" size={20} color="#fff" /><Text style={s.btnPrimaryText}>Descargar plantilla</Text></>}
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.btnSecondary, { borderColor: ACCENT }]}
        onPress={pickAndAnalyze}
        disabled={reading}
        activeOpacity={0.8}
      >
        {reading
          ? <ActivityIndicator color={ACCENT} />
          : <><MaterialIcons name="cloud-upload" size={20} color={ACCENT} /><Text style={[s.btnSecondaryText, { color: ACCENT }]}>Subir archivo lleno</Text></>}
      </TouchableOpacity>

      <Text style={[s.hint, { color: tc.textMuted }]}>Acepta archivos de Excel (.xlsx) y CSV (.csv).</Text>
    </ScrollView>
  );

  const renderPreview = () => {
    if (!analysis) return null;
    const issues = analysis.results.filter(r => r.status !== 'ok');
    return (
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={[s.summaryCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
          <Text style={[s.summaryFile, { color: tc.textMuted }]} numberOfLines={1}>{fileName}</Text>
          <Text style={[s.summaryBig, { color: ACCENT }]}>{analysis.okCount}</Text>
          <Text style={[s.summaryBigLabel, { color: tc.text }]}>
            cliente{analysis.okCount !== 1 ? 's' : ''} listo{analysis.okCount !== 1 ? 's' : ''} para importar
          </Text>

          <View style={s.summaryStats}>
            {analysis.dupExistingCount > 0 && (
              <Text style={[s.summaryStat, { color: tc.textMuted }]}>
                • {analysis.dupExistingCount} ya {analysis.dupExistingCount !== 1 ? 'existen' : 'existe'} (se omiten)
              </Text>
            )}
            {analysis.dupFileCount > 0 && (
              <Text style={[s.summaryStat, { color: tc.textMuted }]}>
                • {analysis.dupFileCount} repetido{analysis.dupFileCount !== 1 ? 's' : ''} en el archivo (se omiten)
              </Text>
            )}
            {analysis.invalidCount > 0 && (
              <Text style={[s.summaryStat, { color: '#DC2626' }]}>
                • {analysis.invalidCount} con error{analysis.invalidCount !== 1 ? 'es' : ''} (no se importan)
              </Text>
            )}
          </View>
        </View>

        {issues.length > 0 && (
          <>
            <Text style={[s.issuesTitle, { color: tc.text }]}>Detalle de filas con avisos</Text>
            {issues.slice(0, 30).map((r: RowResult, idx: number) => (
              <View key={idx} style={[s.issueRow, { backgroundColor: tc.surface, borderColor: tc.border }]}>
                <MaterialIcons
                  name={r.status === 'invalid' ? 'error-outline' : 'info-outline'}
                  size={16}
                  color={r.status === 'invalid' ? '#DC2626' : '#F59E0B'}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[s.issueName, { color: tc.text }]} numberOfLines={1}>
                    Fila {r.row}: {r.rawName || '(sin nombre)'}
                  </Text>
                  <Text style={[s.issueReason, { color: tc.textMuted }]}>{r.reasons.join(' · ')}</Text>
                </View>
              </View>
            ))}
            {issues.length > 30 && (
              <Text style={[s.hint, { color: tc.textMuted }]}>y {issues.length - 30} más…</Text>
            )}
          </>
        )}

        <TouchableOpacity
          style={[s.btnPrimary, { backgroundColor: ACCENT, opacity: analysis.okCount === 0 ? 0.5 : 1 }]}
          onPress={confirmImport}
          disabled={analysis.okCount === 0}
          activeOpacity={0.8}
        >
          <MaterialIcons name="check" size={20} color="#fff" />
          <Text style={s.btnPrimaryText}>
            {analysis.okCount > 0 ? `Importar ${analysis.okCount} cliente${analysis.okCount !== 1 ? 's' : ''}` : 'No hay clientes para importar'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.btnSecondary, { borderColor: tc.border }]}
          onPress={() => { setAnalysis(null); setPhase('intro'); }}
          activeOpacity={0.8}
        >
          <Text style={[s.btnSecondaryText, { color: tc.textMuted }]}>Elegir otro archivo</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderImporting = () => (
    <View style={s.centerWrap}>
      <ActivityIndicator size="large" color={ACCENT} />
      <Text style={[s.centerTitle, { color: tc.text }]}>Importando clientes…</Text>
      <Text style={[s.centerDesc, { color: tc.textMuted }]}>{progress.done} de {progress.total}</Text>
    </View>
  );

  const renderDone = () => (
    <View style={s.centerWrap}>
      <View style={[s.doneIcon, { backgroundColor: ACCENT + '18' }]}>
        <MaterialIcons name="check-circle" size={56} color={ACCENT} />
      </View>
      <Text style={[s.centerTitle, { color: tc.text }]}>¡Listo!</Text>
      <Text style={[s.centerDesc, { color: tc.textMuted }]}>
        {result.imported} cliente{result.imported !== 1 ? 's' : ''} agregado{result.imported !== 1 ? 's' : ''} a tu lista.
        {result.failed > 0 ? ` ${result.failed} no se pudieron guardar.` : ''}
      </Text>
      <TouchableOpacity
        style={[s.btnPrimary, { backgroundColor: ACCENT, marginTop: 24, alignSelf: 'stretch' }]}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Text style={s.btnPrimaryText}>Ver mis clientes</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]} edges={['top']}>
      <View style={[s.header, { borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tc.text }]}>Importar desde Excel</Text>
        <View style={{ width: 24 }} />
      </View>

      {phase === 'intro' && renderIntro()}
      {phase === 'preview' && renderPreview()}
      {phase === 'importing' && renderImporting()}
      {phase === 'done' && renderDone()}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 48 },

  hero: { borderRadius: 20, padding: 20, marginBottom: 20, borderWidth: 1, alignItems: 'center' },
  heroIcon: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  heroTitle: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  heroDesc: { fontSize: 13, lineHeight: 19, textAlign: 'center' },

  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1 },
  stepNum: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  stepNumText: { fontSize: 14, fontWeight: '800' },
  stepTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  stepDesc: { fontSize: 12, lineHeight: 17 },

  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 15, marginTop: 18,
  },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 14, marginTop: 12, borderWidth: 1.5,
  },
  btnSecondaryText: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, textAlign: 'center', marginTop: 14 },

  summaryCard: { borderRadius: 20, padding: 24, marginBottom: 20, borderWidth: 1, alignItems: 'center' },
  summaryFile: { fontSize: 12, marginBottom: 10 },
  summaryBig: { fontSize: 52, fontWeight: '900', letterSpacing: -2, lineHeight: 56 },
  summaryBigLabel: { fontSize: 15, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  summaryStats: { marginTop: 16, gap: 6, alignSelf: 'stretch' },
  summaryStat: { fontSize: 13, lineHeight: 18 },

  issuesTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10, marginTop: 4 },
  issueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1 },
  issueName: { fontSize: 13, fontWeight: '600' },
  issueReason: { fontSize: 11, marginTop: 1 },

  centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 8 },
  centerTitle: { fontSize: 20, fontWeight: '800', marginTop: 8 },
  centerDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  doneIcon: { width: 96, height: 96, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
});
