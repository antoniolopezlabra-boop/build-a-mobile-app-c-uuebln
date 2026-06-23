import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Image, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { IconSymbol } from '@/components/IconSymbol';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { colors } from '@/styles/commonStyles';

// ══════════════════════════════════════════════════════════════
// EXPORTAR DATOS — Pantalla de exportación de datos del negocio
// Límite: 1 exportación por mes calendario
// Formato: CSV (compatible con Excel/Google Sheets)
// Datos: Citas + Clientes con rango de fechas seleccionable
// ══════════════════════════════════════════════════════════════

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatDateMX(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

export default function ExportDataScreen() {
  const router = useRouter();
  const { user, businessProfile } = useAuth();
  const { colors: tc } = useTheme();

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [canExport, setCanExport] = useState(true);
  const [lastExportDate, setLastExportDate] = useState<string | null>(null);
  const [nextExportDate, setNextExportDate] = useState<string | null>(null);
  const [userRegisteredAt, setUserRegisteredAt] = useState<string>('');

  // Date range state
  const [fromYear, setFromYear] = useState(new Date().getFullYear());
  const [fromMonth, setFromMonth] = useState(0); // Enero = 0
  const [toYear, setToYear] = useState(new Date().getFullYear());
  const [toMonth, setToMonth] = useState(new Date().getMonth());

  // Stats preview
  const [previewCitas, setPreviewCitas] = useState<number | null>(null);
  const [previewClientes, setPreviewClientes] = useState<number | null>(null);

  useEffect(() => {
    loadExportStatus();
  }, [user?.id]);

  useEffect(() => {
    if (userRegisteredAt) loadPreview();
  }, [fromYear, fromMonth, toYear, toMonth, userRegisteredAt]);

  const loadExportStatus = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Get user registration date from Supabase Auth
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const regDate = authUser?.created_at || '';
      setUserRegisteredAt(regDate);

      // Set initial fromMonth/fromYear to registration date
      if (regDate) {
        const reg = new Date(regDate);
        setFromYear(reg.getFullYear());
        setFromMonth(reg.getMonth());
      }

      // Check last export date from AsyncStorage-like approach via Supabase
      const { data: exportLog } = await supabase
        .from('export_logs')
        .select('created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (exportLog?.created_at) {
        const lastDate = new Date(exportLog.created_at);
        const now = new Date();
        setLastExportDate(exportLog.created_at);

        // Same calendar month = can't export
        if (lastDate.getFullYear() === now.getFullYear() && lastDate.getMonth() === now.getMonth()) {
          setCanExport(false);
          // Next available: 1st of next month
          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          setNextExportDate(nextMonth.toISOString().slice(0, 10));
        } else {
          setCanExport(true);
        }
      } else {
        setCanExport(true);
      }
    } catch (e) {
      console.error('[Export] Error loading status:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = async () => {
    if (!user?.id) return;
    const fromDate = `${fromYear}-${String(fromMonth + 1).padStart(2, '0')}-01`;
    const toLastDay = new Date(toYear, toMonth + 1, 0).getDate();
    const toDate = `${toYear}-${String(toMonth + 1).padStart(2, '0')}-${toLastDay}`;

    const [{ count: citas }, { count: clientes }] = await Promise.all([
      supabase.from('appointments').select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).gte('date', fromDate).lte('date', toDate),
      supabase.from('clients').select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).gte('created_at', fromDate).lte('created_at', toDate + 'T23:59:59'),
    ]);
    setPreviewCitas(citas || 0);
    setPreviewClientes(clientes || 0);
  };

  const getAvailableMonths = (isFrom: boolean) => {
    const reg = userRegisteredAt ? new Date(userRegisteredAt) : new Date(2026, 0, 1);
    const now = new Date();
    const months: { year: number; month: number; label: string }[] = [];

    let cursor = new Date(reg.getFullYear(), reg.getMonth(), 1);
    while (cursor <= now) {
      months.push({
        year: cursor.getFullYear(),
        month: cursor.getMonth(),
        label: `${MONTHS_ES[cursor.getMonth()]} ${cursor.getFullYear()}`,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  };

  const handleExport = async () => {
    if (!user?.id || !canExport) return;

    const fromDate = `${fromYear}-${String(fromMonth + 1).padStart(2, '0')}-01`;
    const toLastDay = new Date(toYear, toMonth + 1, 0).getDate();
    const toDate = `${toYear}-${String(toMonth + 1).padStart(2, '0')}-${toLastDay}`;

    // Validate date range
    if (new Date(fromDate) > new Date(toDate)) {
      Alert.alert('Error', 'La fecha inicial no puede ser posterior a la fecha final.');
      return;
    }

    Alert.alert(
      'Exportar datos',
      `Se exportarán ${previewCitas || 0} citas y ${previewClientes || 0} clientes del período ${MONTHS_ES[fromMonth]} ${fromYear} a ${MONTHS_ES[toMonth]} ${toYear}.\n\nRecuerda: solo puedes exportar 1 vez al mes.\n\n¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Exportar', onPress: () => executeExport(fromDate, toDate) },
      ]
    );
  };

  const executeExport = async (fromDate: string, toDate: string) => {
    if (!user?.id) return;
    setExporting(true);

    try {
      // Fetch appointments
      const { data: appointments, error: aptErr } = await supabase
        .from('appointments')
        .select(`
          id, date, start_time, end_time, status, service_name, service_cost,
          notes, paid, source, created_at,
          client_name_temp, client_phone_temp,
          clients!appointments_client_id_fkey ( name, phone, email ),
          staff_members!appointments_staff_id_fkey ( name )
        `)
        .eq('user_id', user.id)
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true });

      if (aptErr) throw aptErr;

      // Fetch clients
      const { data: clients, error: cliErr } = await supabase
        .from('clients')
        .select('id, name, phone, email, notes, birthday, created_at')
        .eq('user_id', user.id)
        .gte('created_at', fromDate)
        .lte('created_at', toDate + 'T23:59:59')
        .order('name', { ascending: true });

      if (cliErr) throw cliErr;

      // Build CSV — Citas
      const bizName = businessProfile?.businessName || 'Mi Negocio';
      const exportDate = new Date().toLocaleString('es-MX');

      let csv = '';
      csv += `VYLTA — Reporte de Datos\r\n`;
      csv += `Negocio:,${escCSV(bizName)}\r\n`;
      csv += `Período:,${formatDateMX(fromDate)} — ${formatDateMX(toDate)}\r\n`;
      csv += `Generado:,${exportDate}\r\n`;
      csv += `\r\n`;

      // Citas sheet
      csv += `═══ CITAS (${(appointments || []).length} registros) ═══\r\n`;
      csv += `Fecha,Hora inicio,Hora fin,Cliente,Teléfono,Servicio,Costo,Estado,Pagado,Colaborador,Origen,Notas\r\n`;

      (appointments || []).forEach((a: any) => {
        const clientName = a.clients?.name || a.client_name_temp || 'Sin nombre';
        const clientPhone = a.clients?.phone || a.client_phone_temp || '';
        const staffName = a.staff_members?.name || '';
        const paid = a.paid ? 'Sí' : (a.status === 'Pagado' ? 'Sí' : 'No');
        const source = a.source === 'booking_link' ? 'Link público' : 'App';
        csv += `${a.date},${a.start_time || ''},${a.end_time || ''},${escCSV(clientName)},${escCSV(clientPhone)},${escCSV(a.service_name || '')},${a.service_cost || 0},${a.status || ''},${paid},${escCSV(staffName)},${source},${escCSV(a.notes || '')}\r\n`;
      });

      csv += `\r\n`;

      // Clientes sheet
      csv += `═══ CLIENTES (${(clients || []).length} registros) ═══\r\n`;
      csv += `Nombre,Teléfono,Email,Cumpleaños,Notas,Fecha de registro\r\n`;

      (clients || []).forEach((c: any) => {
        csv += `${escCSV(c.name)},${escCSV(c.phone || '')},${escCSV(c.email || '')},${c.birthday || ''},${escCSV(c.notes || '')},${c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX') : ''}\r\n`;
      });

      csv += `\r\n`;
      csv += `═══ RESUMEN ═══\r\n`;
      csv += `Total citas:,${(appointments || []).length}\r\n`;
      csv += `Total clientes:,${(clients || []).length}\r\n`;

      const totalRevenue = (appointments || []).reduce((sum: number, a: any) => {
        if (a.status === 'Pagado' || (a.status === 'Completada' && a.paid)) {
          return sum + (a.service_cost || 0);
        }
        return sum;
      }, 0);
      csv += `Ingresos cobrados:,$${totalRevenue.toLocaleString('es-MX')}\r\n`;

      const cancelledCount = (appointments || []).filter((a: any) => a.status === 'Cancelada').length;
      csv += `Citas canceladas:,${cancelledCount}\r\n`;

      csv += `\r\nGenerado por VYLTA — vylta.lat\r\n`;

      // Add BOM for Excel to detect UTF-8 correctly
      const BOM = '\uFEFF';
      const csvContent = BOM + csv;

      // Save to file system
      const fileName = `VYLTA_${bizName.replace(/[^a-zA-Z0-9]/g, '_')}_${fromDate}_${toDate}.csv`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Log the export (for rate limiting)
      await supabase.from('export_logs').insert({
        user_id: user.id,
        export_type: 'full_data',
        date_from: fromDate,
        date_to: toDate,
        records_exported: (appointments || []).length + (clients || []).length,
      });

      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: `Datos VYLTA — ${bizName}`,
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Listo', `Archivo guardado como ${fileName}`);
      }

      // Refresh status
      setCanExport(false);
      setLastExportDate(new Date().toISOString());
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
      setNextExportDate(nextMonth.toISOString().slice(0, 10));

    } catch (err: any) {
      console.error('[Export] Error:', err);
      Alert.alert('Error', 'No se pudieron exportar los datos. Intenta de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  // Month selector component
  const MonthSelector = ({ label, year, month, onPrev, onNext, minDate, maxDate }: {
    label: string; year: number; month: number;
    onPrev: () => void; onNext: () => void;
    minDate?: Date; maxDate?: Date;
  }) => {
    const current = new Date(year, month, 1);
    const canPrev = !minDate || current > minDate;
    const canNext = !maxDate || current < maxDate;

    return (
      <View style={s.monthSelector}>
        <Text style={[s.monthLabel, { color: tc.textMuted }]}>{label}</Text>
        <View style={s.monthRow}>
          <TouchableOpacity
            onPress={canPrev ? onPrev : undefined}
            style={[s.monthArrow, !canPrev && s.monthArrowDisabled]}
          >
            <MaterialIcons name="chevron-left" size={24} color={canPrev ? colors.primary : '#D1D5DB'} />
          </TouchableOpacity>
          <View style={s.monthCenter}>
            <Text style={[s.monthText, { color: tc.text }]}>{MONTHS_ES[month]}</Text>
            <Text style={[s.yearText, { color: tc.textMuted }]}>{year}</Text>
          </View>
          <TouchableOpacity
            onPress={canNext ? onNext : undefined}
            style={[s.monthArrow, !canNext && s.monthArrowDisabled]}
          >
            <MaterialIcons name="chevron-right" size={24} color={canNext ? colors.primary : '#D1D5DB'} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const regDate = userRegisteredAt ? new Date(userRegisteredAt) : new Date(2026, 0, 1);
  const minDate = new Date(regDate.getFullYear(), regDate.getMonth(), 1);
  const maxDate = new Date();

  const prevFrom = () => {
    if (fromMonth === 0) { setFromMonth(11); setFromYear(y => y - 1); }
    else setFromMonth(m => m - 1);
  };
  const nextFrom = () => {
    if (fromMonth === 11) { setFromMonth(0); setFromYear(y => y + 1); }
    else setFromMonth(m => m + 1);
  };
  const prevTo = () => {
    if (toMonth === 0) { setToMonth(11); setToYear(y => y - 1); }
    else setToMonth(m => m - 1);
  };
  const nextTo = () => {
    if (toMonth === 11) { setToMonth(0); setToYear(y => y + 1); }
    else setToMonth(m => m + 1);
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
        <View style={s.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.bg }]}>
      <View style={[s.header, { backgroundColor: tc.card, borderBottomColor: tc.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={tc.text} />
        </TouchableOpacity>
        <Text style={[s.title, { color: tc.text }]}>Exportar datos</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Header info */}
        <View style={[s.infoCard, { backgroundColor: tc.card }]}>
          <View style={s.infoRow}>
            {businessProfile?.logoUrl ? (
              <Image source={{ uri: businessProfile.logoUrl }} style={s.logo} />
            ) : (
              <View style={[s.logoPlaceholder, { backgroundColor: tc.surface }]}>
                <MaterialIcons name="store" size={24} color={colors.primary} />
              </View>
            )}
            <View style={s.infoText}>
              <Text style={[s.bizName, { color: tc.text }]}>{businessProfile?.businessName || 'Mi Negocio'}</Text>
              <Text style={[s.bizSub, { color: tc.textMuted }]}>Exportación de datos</Text>
            </View>
          </View>
          <Text style={[s.infoDesc, { color: tc.textMuted }]}>
            Descarga tus citas y clientes en formato CSV compatible con Excel y Google Sheets.
          </Text>
        </View>

        {/* Rate limit warning */}
        {!canExport && (
          <View style={s.limitCard}>
            <MaterialIcons name="schedule" size={20} color="#F59E0B" />
            <View style={s.limitTextWrap}>
              <Text style={s.limitTitle}>Exportación no disponible</Text>
              <Text style={s.limitDesc}>
                Ya exportaste datos este mes{lastExportDate ? ` (${new Date(lastExportDate).toLocaleDateString('es-MX')})` : ''}.
                Podrás exportar de nuevo a partir del {nextExportDate ? formatDateMX(nextExportDate) : 'próximo mes'}.
              </Text>
            </View>
          </View>
        )}

        {/* Date range selector */}
        <Text style={[s.sectionLabel, { color: tc.textMuted }]}>RANGO DE FECHAS</Text>
        <View style={[s.dateCard, { backgroundColor: tc.card }]}>
          <MonthSelector
            label="Desde"
            year={fromYear}
            month={fromMonth}
            onPrev={prevFrom}
            onNext={nextFrom}
            minDate={minDate}
            maxDate={maxDate}
          />
          <View style={[s.dateDivider, { backgroundColor: tc.border }]} />
          <MonthSelector
            label="Hasta"
            year={toYear}
            month={toMonth}
            onPrev={prevTo}
            onNext={nextTo}
            minDate={minDate}
            maxDate={maxDate}
          />
        </View>

        {userRegisteredAt && (
          <Text style={[s.regNote, { color: tc.textMuted }]}>
            Registro: {new Date(userRegisteredAt).toLocaleDateString('es-MX')} — No puedes seleccionar fechas anteriores.
          </Text>
        )}

        {/* Preview */}
        {previewCitas !== null && (
          <View style={[s.previewCard, { backgroundColor: tc.card }]}>
            <Text style={[s.previewTitle, { color: tc.text }]}>Vista previa</Text>
            <View style={s.previewRow}>
              <View style={s.previewItem}>
                <Text style={s.previewNum}>{previewCitas}</Text>
                <Text style={[s.previewLabel, { color: tc.textMuted }]}>Citas</Text>
              </View>
              <View style={[s.previewDivider, { backgroundColor: tc.border }]} />
              <View style={s.previewItem}>
                <Text style={s.previewNum}>{previewClientes}</Text>
                <Text style={[s.previewLabel, { color: tc.textMuted }]}>Clientes</Text>
              </View>
            </View>
          </View>
        )}

        {/* Export button */}
        <TouchableOpacity
          style={[s.exportBtn, (!canExport || exporting) && s.exportBtnDisabled]}
          onPress={handleExport}
          disabled={!canExport || exporting}
          activeOpacity={0.7}
        >
          {exporting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <MaterialIcons name="file-download" size={20} color="#fff" />
          )}
          <Text style={s.exportBtnText}>
            {exporting ? 'Exportando...' : canExport ? 'Exportar datos (CSV)' : 'No disponible este mes'}
          </Text>
        </TouchableOpacity>

        {/* What's included */}
        <View style={[s.includesCard, { backgroundColor: tc.card }]}>
          <Text style={[s.includesTitle, { color: tc.text }]}>¿Qué incluye el archivo?</Text>
          {[
            ['calendar-today', 'Todas tus citas del período seleccionado'],
            ['people', 'Clientes registrados en ese período'],
            ['attach-money', 'Ingresos cobrados y pendientes'],
            ['description', 'Notas, estado de pago y origen de cita'],
            ['person', 'Colaborador asignado (si aplica)'],
          ].map(([icon, text], i) => (
            <View key={i} style={s.includeRow}>
              <MaterialIcons name={icon as any} size={16} color={colors.primary} />
              <Text style={[s.includeText, { color: tc.textMuted }]}>{text}</Text>
            </View>
          ))}
        </View>

        <Text style={[s.footerNote, { color: tc.textMuted }]}>
          El archivo CSV se puede abrir en Excel, Google Sheets o Numbers. Los datos se exportan con codificación UTF-8 para soporte completo de acentos y caracteres especiales.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function escCSV(val: string): string {
  if (!val) return '';
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

const s = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingTop: 16, borderBottomWidth: 1,
  },
  back: { padding: 4 },
  title: { fontSize: 20, fontWeight: 'bold' },
  scroll: { padding: 20, paddingBottom: 60 },

  // Info card
  infoCard: { borderRadius: 16, padding: 20, marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  logo: { width: 48, height: 48, borderRadius: 12 },
  logoPlaceholder: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  bizName: { fontSize: 18, fontWeight: '700' },
  bizSub: { fontSize: 12, marginTop: 2 },
  infoText: { flex: 1 },
  infoDesc: { fontSize: 13, lineHeight: 19 },

  // Rate limit
  limitCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#FFFBEB', borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  limitTextWrap: { flex: 1 },
  limitTitle: { fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 4 },
  limitDesc: { fontSize: 12, color: '#A16207', lineHeight: 18 },

  // Section
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 },

  // Date card
  dateCard: { borderRadius: 16, padding: 20, marginBottom: 8 },
  dateDivider: { height: 1, marginVertical: 16 },
  monthSelector: {},
  monthLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthArrow: { padding: 8 },
  monthArrowDisabled: { opacity: 0.3 },
  monthCenter: { alignItems: 'center' },
  monthText: { fontSize: 18, fontWeight: '700' },
  yearText: { fontSize: 12, marginTop: 2 },
  regNote: { fontSize: 11, marginBottom: 16, marginLeft: 4 },

  // Preview
  previewCard: { borderRadius: 16, padding: 20, marginBottom: 20 },
  previewTitle: { fontSize: 14, fontWeight: '700', marginBottom: 14 },
  previewRow: { flexDirection: 'row', alignItems: 'center' },
  previewItem: { flex: 1, alignItems: 'center' },
  previewNum: { fontSize: 32, fontWeight: '900', color: colors.primary },
  previewLabel: { fontSize: 12, marginTop: 4 },
  previewDivider: { width: 1, height: 40 },

  // Export button
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: colors.primary, borderRadius: 14, padding: 16, marginBottom: 20,
  },
  exportBtnDisabled: { backgroundColor: '#9CA3AF' },
  exportBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Includes
  includesCard: { borderRadius: 16, padding: 20, marginBottom: 16 },
  includesTitle: { fontSize: 14, fontWeight: '700', marginBottom: 14 },
  includeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  includeText: { fontSize: 13, flex: 1 },

  footerNote: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 4 },
});
