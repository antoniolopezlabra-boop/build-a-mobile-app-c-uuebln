
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, TouchableOpacity, TextInput, ActivityIndicator,
  Modal, Switch, Keyboard, Dimensions,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { apiGet, apiPost } from '@/utils/api';
import { invalidateCache } from '@/utils/cache';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePlan } from '@/contexts/PlanContext';
import { useAuth } from '@/contexts/AuthContext';
import { useGratuitoUsage } from '@/contexts/useGratuitoUsage';
import { ConfirmModal } from '@/components/button';
import { supabase } from '@/lib/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { writeAppointmentServices, SelectedService } from '@/utils/appointmentServices';

interface Client {
  id: string;
  name: string;
  phone: string;
}

interface TimeBlockData {
  id: string;
  staff_id: string | null;
  label: string;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  day_of_week: number | null;
  specific_date: string | null;
}

interface TimeSlot {
  time: string;
  available: boolean;
  endTime?: string;
  isOverlap?: boolean;
  isBlocked?: boolean;
  blockedLabel?: string;
  unavailableReason?: 'block' | 'booked' | 'closed' | null;
}

interface CatalogService {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  durationMinutes: number;
}

interface StaffMember {
  id: string;
  name: string;
  role: string | null;
  color: string;
}

// ── Claves AsyncStorage para preservar el formulario al ir a crear cliente
//    y volver con el cliente recién creado auto-seleccionado.
const DRAFT_KEY = 'vylta_new_appt_draft';
const NEW_CLIENT_KEY = 'vylta_new_appt_new_client';

interface AppointmentDraft {
  serviceText: string;
  selectedServiceIds: string[];
  selectedStaffId: string | null;
  dateIso: string;
  time: string;
  selectedBlocks: string[];
  notes: string;
  serviceCost: string;
  sendWhatsApp: boolean;
}

const durationLabel = (min: number) =>
  min < 60 ? `${min} min` : min === 60 ? '1 hora' : `${Math.floor(min / 60)}h${min % 60 > 0 ? ` ${min % 60}min` : ''}`;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Helper: minutos desde medianoche
const timeToMin = (t: string): number => {
  if (!t || typeof t !== 'string') return 0;
  const parts = t.split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};

// Helper: encuentra un bloqueo aplicable para el slot dado.
function findBlockForSlot(
  slotStartMin: number,
  slotEndMin: number,
  dateStr: string,
  jsDay: number,
  staffId: string | null,
  blocks: TimeBlockData[]
): TimeBlockData | null {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;

  const projectDay = jsDay === 0 ? 6 : jsDay - 1;
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.staff_id) {
      if (b.staff_id !== staffId) continue;
    }
    if (b.is_recurring) {
      if (b.day_of_week !== projectDay) continue;
    } else {
      if (b.specific_date !== dateStr) continue;
    }
    const bStart = timeToMin(b.start_time);
    const bEnd = timeToMin(b.end_time);
    if (slotStartMin < bEnd && slotEndMin > bStart) return b;
  }
  return null;
}

class ScreenErrorBoundary extends React.Component<
  { children: React.ReactNode; onBack: () => void },
  { hasError: boolean; errorMsg: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: any) {
    return {
      hasError: true,
      errorMsg: error?.message || 'Ocurrió un error inesperado',
    };
  }

  componentDidCatch(error: any, info: any) {
    console.warn('[NewAppointment ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={errorStyles.container} edges={['top']}>
          <View style={errorStyles.content}>
            <View style={errorStyles.iconWrap}>
              <MaterialIcons name="error-outline" size={56} color="#EF4444" />
            </View>
            <Text style={errorStyles.title}>No pudimos cargar esta pantalla</Text>
            <Text style={errorStyles.desc}>
              Ocurrió un error al preparar el formulario de cita. Por favor intenta de nuevo.
            </Text>
            <Text style={errorStyles.errorMsg} numberOfLines={2}>
              {__DEV__ ? this.state.errorMsg : 'Algo salió mal. Intenta de nuevo.'}
            </Text>
            <TouchableOpacity style={errorStyles.backBtn} onPress={this.props.onBack}>
              <Text style={errorStyles.backBtnText}>Volver</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

function NewAppointmentInner() {
  const router = useRouter();
  const { user } = useAuth();
  const { isGratuito, canUseMultiService } = usePlan();
  const usage = useGratuitoUsage();
  const insets = useSafeAreaInsets(); // ⚡ Safe-area inferior (botones Android, home indicator iOS)
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const saveLockRef = useRef(false);

  // ── Ref para evitar restaurar dos veces el draft (en mount y al focus)
  const draftRestoredRef = useRef(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [service, setService] = useState('');
  const [selectedServices, setSelectedServices] = useState<CatalogService[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [showStaffPicker, setShowStaffPicker] = useState(false);

  const [date, setDate] = useState(new Date());
  const [showDatePanel, setShowDatePanel] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());
  const [showDatePickerAndroid, setShowDatePickerAndroid] = useState(false);

  const [time, setTime] = useState('');
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [serviceCost, setServiceCost] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(true);

  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [dayIsClosed, setDayIsClosed] = useState(false);
  const [allowOverlapping, setAllowOverlapping] = useState(false);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlockData[]>([]);
  const [errorModal, setErrorModal] = useState({ visible: false, message: '' });

  // ⚡ Multi-servicio: totales en vivo (suma de duraciones y precios de los
  // servicios elegidos). Alimentan la auto-seleccion de bloques y el resumen.
  const totalServiceDuration = selectedServices.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const totalServiceCost = selectedServices.reduce((sum, s) => sum + (s.price || 0), 0);

  const serviceInputRef = useRef<TextInput>(null);
  const costInputRef    = useRef<TextInput>(null);
  const notesInputRef   = useRef<TextInput>(null);

  const dismissKeyboard = () => {
    serviceInputRef.current?.blur();
    costInputRef.current?.blur();
    notesInputRef.current?.blur();
    Keyboard.dismiss();
  };

  const openDatePicker = () => {
    dismissKeyboard();
    if (Platform.OS === 'ios') { setTempDate(date); setShowDatePanel(true); }
    else setTimeout(() => setShowDatePickerAndroid(true), 150);
  };

  const confirmDateIOS = () => { setDate(tempDate); setShowDatePanel(false); };
  const cancelDateIOS  = () => { setTempDate(date);  setShowDatePanel(false); };
  const onAndroidDateChange = (_event: any, selected?: Date) => {
    setShowDatePickerAndroid(false);
    if (_event.type === 'set' && selected) setDate(selected);
  };

  // ⚡ Multi-servicio: agrega o quita un servicio del catalogo. En planes sin
  // multi-servicio (Gratuito) se comporta como antes: un solo servicio.
  const handleToggleService = (svc: CatalogService) => {
    const exists = selectedServices.some(s => s.id === svc.id);
    let next: CatalogService[];
    if (exists) next = selectedServices.filter(s => s.id !== svc.id);
    else if (canUseMultiService) next = [...selectedServices, svc];
    else next = [svc];

    setSelectedServices(next);

    const totalDur  = next.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
    const totalCost = next.reduce((sum, s) => sum + (s.price || 0), 0);
    setServiceCost(totalCost > 0 ? String(totalCost) : '');
    setService(next.length > 0 ? next.map(s => s.name).join(' + ') : '');

    // Re-extender los bloques desde el primero seleccionado para cubrir la
    // duracion TOTAL sumada (misma logica de slots, solo cambia el total).
    if (selectedBlocks.length > 0 && timeSlots.length > 0 && totalDur > 0) {
      const blocks   = Math.ceil(totalDur / 30);
      const firstIdx = timeSlots.findIndex(s => s.time === selectedBlocks[0]);
      if (firstIdx !== -1) {
        const range = timeSlots.slice(firstIdx, firstIdx + blocks);
        if (range.length === blocks && range.every(s => s.available)) {
          setSelectedBlocks(range.map(s => s.time));
        }
      }
    }

    // En planes sin multi-servicio, cerrar el modal al elegir (como antes).
    if (!canUseMultiService) { setShowServicePicker(false); setServiceSearchQuery(''); }
  };

  // ── Guarda snapshot del formulario y navega a crear cliente.
  //    Al regresar, useFocusEffect detectará el nuevo cliente y restaurará el form.
  const goToCreateClient = async () => {
    dismissKeyboard();
    setShowClientPicker(false);
    try {
      const draft: AppointmentDraft = {
        serviceText: service,
        selectedServiceIds: selectedServices.map(s => s.id),
        selectedStaffId: selectedStaff?.id ?? null,
        dateIso: date.toISOString(),
        time,
        selectedBlocks,
        notes,
        serviceCost,
        sendWhatsApp,
      };
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      // Permitir que el draft se restaure cuando volvamos
      draftRestoredRef.current = false;
    } catch (e) {
      console.warn('[new-appointment] no se pudo guardar draft:', e);
    }
    router.push('/clients/new?returnTo=appointments-new');
  };

  // ── Carga inicial: TODO con Promise.allSettled
  useEffect(() => {
    let mounted = true;
    const loadAll = async () => {
      try {
        await Promise.allSettled([
          loadClients(),
          loadOverlapConfig(),
          loadCatalogServices(),
          loadStaffMembers(),
          loadTimeBlocks(),
        ]);
      } catch (e) {
        console.warn('[new-appointment] loadAll error:', e);
      } finally {
        if (mounted) setInitialLoading(false);
      }
    };
    loadAll();
    return () => { mounted = false; };
  }, []);

  // ── Al regresar de crear un cliente, restaurar draft + auto-seleccionar cliente
  useFocusEffect(
    useCallback(() => {
      // Si ya restauramos en este "viaje", no repetir hasta que se inicie otro flujo
      if (draftRestoredRef.current) return;

      let cancelled = false;
      const restoreOnFocus = async () => {
        try {
          const [draftRaw, newClientRaw] = await Promise.all([
            AsyncStorage.getItem(DRAFT_KEY),
            AsyncStorage.getItem(NEW_CLIENT_KEY),
          ]);

          // Solo restauramos si hay un cliente nuevo creado (es decir, sí venimos de regreso del flujo)
          if (!newClientRaw) {
            // Si no venimos de crear cliente, no tocar nada y limpiar draft viejo si quedó.
            if (draftRaw) await AsyncStorage.removeItem(DRAFT_KEY);
            return;
          }

          if (cancelled) return;

          // Parsear cliente recién creado
          let newClient: Client | null = null;
          try {
            const parsed = JSON.parse(newClientRaw);
            if (parsed?.id) newClient = parsed;
          } catch {}

          // Restaurar draft del formulario
          if (draftRaw) {
            try {
              const draft: AppointmentDraft = JSON.parse(draftRaw);
              if (draft) {
                setService(draft.serviceText || '');
                setNotes(draft.notes || '');
                setServiceCost(draft.serviceCost || '');
                setSendWhatsApp(draft.sendWhatsApp !== false);
                setTime(draft.time || '');
                setSelectedBlocks(Array.isArray(draft.selectedBlocks) ? draft.selectedBlocks : []);
                if (draft.dateIso) {
                  const d = new Date(draft.dateIso);
                  if (!isNaN(d.getTime())) setDate(d);
                }
                // selectedServices y selectedStaff: los reasignamos cuando las listas estén cargadas
                if (Array.isArray(draft.selectedServiceIds) && draft.selectedServiceIds.length > 0) {
                  setCatalogServices(prev => {
                    const found = prev.filter(s => draft.selectedServiceIds.includes(s.id));
                    if (found.length > 0) setSelectedServices(found);
                    return prev;
                  });
                }
                if (draft.selectedStaffId) {
                  setStaffMembers(prev => {
                    const found = prev.find(s => s.id === draft.selectedStaffId);
                    if (found) setSelectedStaff(found);
                    return prev;
                  });
                }
              }
            } catch (e) {
              console.warn('[new-appointment] draft inválido:', e);
            }
          }

          // Recargar clientes para que el nuevo aparezca en la lista, luego seleccionarlo
          await loadClients();
          if (newClient && !cancelled) {
            setSelectedClient(newClient);
          }

          // Limpiar señales
          await Promise.all([
            AsyncStorage.removeItem(DRAFT_KEY),
            AsyncStorage.removeItem(NEW_CLIENT_KEY),
          ]);

          draftRestoredRef.current = true;
        } catch (e) {
          console.warn('[new-appointment] restoreOnFocus error:', e);
        }
      };

      restoreOnFocus();
      return () => { cancelled = true; };
    }, [])
  );

  // Recalcular disponibilidad cuando cambia el servicio, fecha, colaborador o bloqueos
  useEffect(() => {
    if (initialLoading) return;
    checkAvailability();
  }, [date, selectedStaff, timeBlocks, totalServiceDuration, initialLoading]);

  const loadCatalogServices = async () => {
    try {
      const data = await apiGet<CatalogService[]>('/api/services');
      setCatalogServices(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('[new-appointment] loadCatalogServices error:', e);
      setCatalogServices([]);
    }
  };

  const loadOverlapConfig = async () => {
    try {
      const { getCurrentUserId } = await import('@/utils/api');
      const userId = await getCurrentUserId();
      if (!userId) return;
      const { data } = await supabase
        .from('business_profiles')
        .select('allow_overlapping')
        .eq('user_id', userId)
        .maybeSingle();
      if (data) setAllowOverlapping(!!data.allow_overlapping);
    } catch (e) {
      console.warn('[new-appointment] loadOverlapConfig error:', e);
    }
  };

  const loadStaffMembers = async () => {
    try {
      if (!user?.id) { setStaffMembers([]); return; }
      const { data } = await supabase
        .from('staff_members')
        .select('id, name, role, color')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('sort_order');
      setStaffMembers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('[new-appointment] loadStaffMembers error:', e);
      setStaffMembers([]);
    }
  };

  const loadTimeBlocks = async () => {
    try {
      const data = await apiGet<TimeBlockData[]>('/api/time-blocks');
      setTimeBlocks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('[new-appointment] loadTimeBlocks error:', e);
      setTimeBlocks([]);
    }
  };

  const loadClients = async () => {
    try {
      const data = await apiGet<Client[]>('/api/clients');
      setClients(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('[new-appointment] loadClients error:', e);
      setClients([]);
    }
  };

  const checkAvailability = async () => {
    try {
      const dateString = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

      const results = await Promise.allSettled([
        apiGet<any[]>(`/api/appointments/date/${dateString}`),
        apiGet<any[]>('/api/business-hours'),
      ]);

      const appointments: any[] = results[0].status === 'fulfilled' && Array.isArray(results[0].value)
        ? results[0].value : [];
      const businessHours: any[] = results[1].status === 'fulfilled' && Array.isArray(results[1].value)
        ? results[1].value : [];

      const dayOfWeek = date.getDay();

      let dayConfig: any = null;
      if (selectedStaff?.id) {
        try {
          const { data: sh } = await supabase
            .from('staff_hours')
            .select('*')
            .eq('staff_id', selectedStaff.id)
            .eq('day_of_week', dayOfWeek)
            .maybeSingle();
          if (sh) {
            dayConfig = { isOpen: sh.is_open, startTime: sh.start_time, endTime: sh.end_time };
          }
        } catch (e) {
          console.warn('[new-appointment] staff_hours error:', e);
        }
      }

      if (!dayConfig) {
        const defaultHours = [0,1,2,3,4,5,6].map(d => ({
          dayOfWeek: d, isOpen: d >= 1 && d <= 5, startTime: '09:00', endTime: '18:00',
        }));
        const hoursToUse = businessHours.length > 0 ? businessHours : defaultHours;
        const found = hoursToUse.find((d: any) => d && d.dayOfWeek === dayOfWeek);
        dayConfig = found ? { isOpen: found.isOpen, startTime: found.startTime, endTime: found.endTime } : null;
      }

      if (!dayConfig || !dayConfig.isOpen) { setDayIsClosed(true); setTimeSlots([]); return; }

      if (!dayConfig.startTime || !dayConfig.endTime ||
          typeof dayConfig.startTime !== 'string' ||
          typeof dayConfig.endTime !== 'string') {
        console.warn('[new-appointment] dayConfig inválido:', dayConfig);
        setDayIsClosed(true); setTimeSlots([]); return;
      }

      setDayIsClosed(false);

      const startParts = dayConfig.startTime.split(':');
      const endParts   = dayConfig.endTime.split(':');
      const startHour = parseInt(startParts[0] || '9', 10);
      const startMin  = parseInt(startParts[1] || '0', 10);
      const endHour   = parseInt(endParts[0] || '18', 10);
      const endMin    = parseInt(endParts[1] || '0', 10);
      const dayStartMin = (isNaN(startHour) ? 9 : startHour) * 60 + (isNaN(startMin) ? 0 : startMin);
      const dayEndMin   = (isNaN(endHour) ? 18 : endHour) * 60 + (isNaN(endMin) ? 0 : endMin);

      if (dayEndMin <= dayStartMin) {
        setDayIsClosed(true); setTimeSlots([]); return;
      }

      const allDateAppointments = appointments;

      let staffAppointments: any[]    = [];
      let generalAppointments: any[]  = [];

      if (selectedStaff) {
        staffAppointments   = allDateAppointments.filter((a: any) => a && a.staff_id === selectedStaff.id);
        generalAppointments = [];
      } else {
        staffAppointments   = [];
        generalAppointments = allDateAppointments;
      }

      const today = new Date();
      const todayString = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const isToday = dateString === todayString;

      const slots: TimeSlot[] = [];

      for (let totalMin = dayStartMin; totalMin < dayEndMin; totalMin += 30) {
        const hour = Math.floor(totalMin/60);
        const minute = totalMin%60;
        const timeString = `${hour.toString().padStart(2,'0')}:${minute.toString().padStart(2,'0')}`;
        const slotEndMin = totalMin + 30;

        const blockedByStaff = staffAppointments.some((appt: any) => {
          if (!appt) return false;
          const startStr = appt.time || appt.startTime || '00:00';
          const endStr   = appt.endTime || appt.end_time || '00:00';
          const aStart = timeToMin(startStr);
          const aEnd   = timeToMin(endStr);
          return totalMin >= aStart && totalMin < aEnd;
        });

        const blockedByGeneral = !allowOverlapping && generalAppointments.some((appt: any) => {
          if (!appt) return false;
          const startStr = appt.time || appt.startTime || '00:00';
          const endStr   = appt.endTime || appt.end_time || '00:00';
          const aStart = timeToMin(startStr);
          const aEnd   = timeToMin(endStr);
          return totalMin >= aStart && totalMin < aEnd;
        });

        const isOverlap = !selectedStaff && allowOverlapping && generalAppointments.some((appt: any) => {
          if (!appt) return false;
          const startStr = appt.time || appt.startTime || '00:00';
          const endStr   = appt.endTime || appt.end_time || '00:00';
          const aStart = timeToMin(startStr);
          const aEnd   = timeToMin(endStr);
          return totalMin >= aStart && totalMin < aEnd;
        });

        const isBooked = blockedByStaff || blockedByGeneral;
        const isPast = isToday && (hour < today.getHours() || (hour === today.getHours() && minute <= today.getMinutes()));

        const blockingTimeBlock = findBlockForSlot(
          totalMin, slotEndMin, dateString, dayOfWeek, selectedStaff?.id || null, timeBlocks
        );
        const isBlocked = !!blockingTimeBlock;

        slots.push({
          time: timeString,
          available: !isBooked && !isPast && !isBlocked,
          isOverlap: isOverlap && !isPast && !isBlocked,
          isBlocked,
          blockedLabel: blockingTimeBlock?.label,
          unavailableReason: null,
        });
      }

      const durationMin = totalServiceDuration > 0 ? totalServiceDuration : 30;
      const subBlocksNeeded = Math.ceil(durationMin / 30);

      if (subBlocksNeeded > 1) {
        for (let i = 0; i < slots.length; i++) {
          const startSlot = slots[i];
          if (!startSlot.available && !startSlot.isOverlap) continue;

          let rangeOK = true;
          let reason: 'block' | 'booked' | 'closed' | null = null;

          for (let j = 0; j < subBlocksNeeded; j++) {
            const subSlot = slots[i + j];
            if (!subSlot) {
              rangeOK = false;
              reason = 'closed';
              break;
            }
            if (subSlot.isBlocked) {
              rangeOK = false;
              reason = 'block';
              break;
            }
            if (!subSlot.available && !subSlot.isOverlap) {
              rangeOK = false;
              reason = subSlot.isBlocked ? 'block' : 'booked';
              break;
            }
          }

          if (!rangeOK) {
            slots[i].available = false;
            slots[i].unavailableReason = reason;
          }
        }
      }

      setTimeSlots(slots);
    } catch (e) {
      console.warn('[new-appointment] checkAvailability error:', e);
      setTimeSlots([]);
      setDayIsClosed(false);
    }
  };

  const handleSave = async () => {
    if (saveLockRef.current) return;

    Keyboard.dismiss();
    if (!selectedClient) { setErrorModal({ visible: true, message: 'Por favor selecciona un cliente' }); return; }
    if (!service.trim())  { setErrorModal({ visible: true, message: 'Por favor selecciona o ingresa al menos un servicio' }); return; }
    if (selectedBlocks.length === 0 || !time) { setErrorModal({ visible: true, message: 'Por favor selecciona un horario disponible' }); return; }
    const lastBlock = selectedBlocks.length > 0 ? selectedBlocks[selectedBlocks.length-1] : time;
    const [lh, lm] = lastBlock.split(':').map(Number);
    const endMinutes = lh*60+lm+30;
    const calculatedEndTime = `${Math.floor(endMinutes/60).toString().padStart(2,'0')}:${(endMinutes%60).toString().padStart(2,'0')}`;
    const selectedSlot = timeSlots.find(slot => slot.time === time);
    if (!selectedSlot || !selectedSlot.available) {
      setErrorModal({ visible: true, message: 'El horario seleccionado no está disponible.' }); return;
    }

    saveLockRef.current = true;
    setLoading(true);

    try {
      const dateString = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      const created: any = await apiPost('/api/appointments', {
        clientId:   selectedClient.id,
        service:    service.trim(),
        date:       dateString,
        time,
        status:     'Pendiente',
        notes:      notes.trim() || undefined,
        service_cost: serviceCost ? parseFloat(serviceCost) : 0,
        endTime:    calculatedEndTime,
        staff_id:   selectedStaff?.id || null,
        isOverlapping: selectedBlocks.some(b => timeSlots.find(s => s.time === b)?.isOverlap),
      });

      // ⚡ Multi-servicio: guardar el desglose en appointment_services.
      // Best-effort: la cita ya quedó con su resumen (nombre combinado, costo
      // total y hora fin); si esto fallara, la cita sigue siendo válida.
      try {
        const apptId = created?.id;
        if (apptId) {
          const servicesToWrite: SelectedService[] = selectedServices.length > 0
            ? selectedServices.map(s => ({ serviceId: s.id, name: s.name, price: s.price, durationMinutes: s.durationMinutes }))
            : [{ serviceId: null, name: service.trim(), price: serviceCost ? parseFloat(serviceCost) : 0, durationMinutes: Math.max(30, selectedBlocks.length * 30) }];
          await writeAppointmentServices(apptId, servicesToWrite);
        }
      } catch (e) {
        console.warn('[new-appointment] no se pudo guardar el desglose de servicios:', e);
      }

      invalidateCache('dashboard_stats');
      invalidateCache('today_appointments');
      invalidateCache('appointments_list');
      router.back();
    } catch (error: any) {
      saveLockRef.current = false;
      setLoading(false);
      setErrorModal({ visible: true, message: error?.message || 'Error al crear la cita' });
    }
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone.includes(searchQuery)
  );
  const filteredCatalogServices = catalogServices.filter(s =>
    s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase())
  );
  const formattedDate = date.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const formattedTempDate = tempDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hasCatalog = catalogServices.length > 0;
  const hasStaff   = staffMembers.length > 0;

  const usageColor = usage.isAtLimit ? '#EF4444' : usage.isNearLimit ? '#F59E0B' : '#0EA5E9';
  const usageBgColor = usage.isAtLimit ? '#FEF2F2' : usage.isNearLimit ? '#FFFBEB' : '#E0F2FE';
  const usageBorderColor = usage.isAtLimit ? '#FCA5A5' : usage.isNearLimit ? '#FDE68A' : '#7DD3FC';
  const usageTitle = usage.isAtLimit
    ? '¡Límite alcanzado!'
    : usage.isNearLimit
      ? `Solo ${usage.remaining} cita${usage.remaining !== 1 ? 's' : ''} restante${usage.remaining !== 1 ? 's' : ''}`
      : `${usage.used} de ${usage.limit} citas usadas este mes`;
  const usageDesc = usage.isAtLimit
    ? 'No puedes crear más citas este mes. Toca para mejorar a Premium.'
    : 'Plan Básico — Mejora a Premium para citas ilimitadas';

  const hasInvalidByDuration = totalServiceDuration > 0 && timeSlots.some(s => s.unavailableReason);
  const canSave = !!selectedClient && !!service.trim() && selectedBlocks.length > 0 && !dayIsClosed;

  // ⚡ Padding inferior dinámico para respetar zona de tolerancia.
  // - Android con botones clásicos de navegación: insets.bottom = 0 → mínimo 16px
  // - Android con barra gestual:                   insets.bottom = ~16-24px → respeta el inset real
  // - iPhone X+:                                   insets.bottom = ~34px (home indicator)
  // Math.max garantiza un mínimo decente sin importar el caso.
  const safeBottom = Math.max(insets.bottom, 16);

  if (initialLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Nueva Cita</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Preparando formulario...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol android_material_icon_name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Nueva Cita</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          style={styles.content}
          /* ⚡ contentContainerStyle con paddingBottom dinámico:
             garantiza que el último elemento (botón Guardar Cita) NUNCA
             quede pegado al borde inferior, respetando la zona de tolerancia
             de cada dispositivo. */
          contentContainerStyle={{ paddingBottom: safeBottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          scrollEnabled={!showDatePanel}
        >
          {isGratuito && !usage.loading && (
            <TouchableOpacity
              style={[styles.usageCard, { backgroundColor: usageBgColor, borderColor: usageBorderColor }]}
              onPress={() => router.push('/settings/subscription')}
              activeOpacity={0.85}
            >
              <View style={styles.usageHeader}>
                <MaterialIcons
                  name={usage.isAtLimit ? 'block' : usage.isNearLimit ? 'warning' : 'event-available'}
                  size={18}
                  color={usageColor}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.usageTitle, { color: usageColor }]}>{usageTitle}</Text>
                  <Text style={styles.usageDesc}>{usageDesc}</Text>
                </View>
                <Text style={[styles.usageCount, { color: usageColor }]}>{usage.used}/{usage.limit}</Text>
              </View>
              <View style={styles.usageProgressBg}>
                <View style={[styles.usageProgressFill, { width: `${usage.percentage}%`, backgroundColor: usageColor }]} />
              </View>
            </TouchableOpacity>
          )}

          {/* Cliente */}
          <View style={styles.section}>
            {/* labelRow con botón "+ Nuevo cliente" estilo "Ver catálogo" */}
            <View style={styles.labelRow}>
              <Text style={styles.label}>Cliente *</Text>
              <TouchableOpacity style={styles.catalogBtn} onPress={goToCreateClient}>
                <MaterialIcons name="person-add-alt-1" size={14} color="#10B981" />
                <Text style={styles.catalogBtnText}>Nuevo cliente</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.input} onPress={() => { dismissKeyboard(); setShowClientPicker(true); }}>
              <Text style={selectedClient ? styles.inputText : styles.inputPlaceholder}>
                {selectedClient ? selectedClient.name : 'Seleccionar cliente'}
              </Text>
              <IconSymbol android_material_icon_name="arrow-drop-down" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Servicios */}
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{canUseMultiService ? 'Servicios *' : 'Servicio *'}</Text>
              {hasCatalog && (
                <TouchableOpacity style={styles.catalogBtn} onPress={() => { dismissKeyboard(); setShowServicePicker(true); }}>
                  <MaterialIcons name="menu-book" size={14} color="#10B981" />
                  <Text style={styles.catalogBtnText}>{canUseMultiService && selectedServices.length > 0 ? 'Agregar' : 'Ver catálogo'}</Text>
                </TouchableOpacity>
              )}
            </View>
            {selectedServices.length > 0 ? (
              <View style={styles.servicesBox}>
                {selectedServices.map((svc) => (
                  <View key={svc.id} style={styles.serviceChip}>
                    <View style={styles.catalogSelectedIcon}>
                      <MaterialIcons name="work-outline" size={16} color="#10B981" />
                    </View>
                    <View style={styles.catalogSelectedInfo}>
                      <Text style={styles.catalogSelectedName}>{svc.name}</Text>
                      <Text style={styles.catalogSelectedMeta}>
                        {durationLabel(svc.durationMinutes)} · ${svc.price.toLocaleString('es-MX')} MXN
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleToggleService(svc)} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                      <MaterialIcons name="close" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>
                ))}
                {selectedServices.length > 1 && (
                  <View style={styles.servicesTotalRow}>
                    <Text style={styles.servicesTotalLabel}>{selectedServices.length} servicios · {durationLabel(totalServiceDuration)}</Text>
                    <Text style={styles.servicesTotalValue}>${totalServiceCost.toLocaleString('es-MX')} MXN</Text>
                  </View>
                )}
                {canUseMultiService && hasCatalog && (
                  <TouchableOpacity style={styles.addMoreBtn} onPress={() => { dismissKeyboard(); setShowServicePicker(true); }}>
                    <MaterialIcons name="add" size={16} color="#10B981" />
                    <Text style={styles.addMoreBtnText}>Agregar otro servicio</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TextInput
                ref={serviceInputRef}
                style={styles.textInput}
                value={service}
                onChangeText={setService}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                placeholder={hasCatalog ? 'Escribe o selecciona del catálogo' : 'Ej: Corte de cabello, Manicure...'}
                placeholderTextColor={colors.textSecondary}
              />
            )}
          </View>

          {/* Selector de colaborador */}
          {hasStaff && (
            <View style={styles.section}>
              <Text style={styles.label}>¿Quién atiende?</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => { dismissKeyboard(); setShowStaffPicker(true); }}
              >
                {selectedStaff ? (
                  <View style={styles.staffPreview}>
                    <View style={[styles.staffDot, { backgroundColor: selectedStaff.color }]} />
                    <Text style={styles.inputText}>{selectedStaff.name}</Text>
                    {selectedStaff.role ? (
                      <Text style={styles.staffRoleInline}> · {selectedStaff.role}</Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.inputPlaceholder}>Sin asignar (cualquiera)</Text>
                )}
                <IconSymbol android_material_icon_name="arrow-drop-down" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Fecha */}
          <View style={styles.section}>
            <Text style={styles.label}>Fecha *</Text>
            <TouchableOpacity style={[styles.input, showDatePanel && styles.inputActive]} onPress={openDatePicker}>
              <Text style={styles.inputText}>{formattedDate}</Text>
              <IconSymbol android_material_icon_name="event" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Hora */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Hora *{selectedStaff ? ` — ${selectedStaff.name}` : ''}
              {totalServiceDuration > 0 ? ` (${durationLabel(totalServiceDuration)})` : ''}
            </Text>
            {dayIsClosed ? (
              <View style={styles.dayClosedContainer}>
                <Text style={styles.dayClosedText}>
                  🚫 {selectedStaff ? `${selectedStaff.name} no trabaja este día` : 'Este día no tienes atención configurada'}
                </Text>
                <Text style={styles.dayClosedSubtext}>Selecciona otro día o cambia de colaborador</Text>
              </View>
            ) : (
              <>
                {selectedBlocks.length > 0 && (
                  <View style={styles.durationBadge}>
                    <Text style={styles.durationText}>
                      ⏱ {selectedBlocks[0]} → {(() => {
                        const [h,m] = selectedBlocks[selectedBlocks.length-1].split(':').map(Number);
                        const e = h*60+m+30;
                        return `${Math.floor(e/60).toString().padStart(2,'0')}:${(e%60).toString().padStart(2,'0')}`;
                      })()} · {selectedBlocks.length*30} min
                    </Text>
                    <TouchableOpacity onPress={() => { setSelectedBlocks([]); setTime(''); }}>
                      <Text style={styles.durationClear}>✕ Limpiar</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeSlotsContainer} keyboardShouldPersistTaps="handled">
                  {timeSlots.map((slot) => {
                    const isSelected = selectedBlocks.includes(slot.time);
                    const isOverlap  = slot.isOverlap && !isSelected;
                    const isBlocked  = slot.isBlocked;
                    const isInvalidByDuration = !!slot.unavailableReason && !isBlocked;
                    return (
                      <TouchableOpacity
                        key={slot.time}
                        accessibilityRole="button"
                        accessibilityLabel={`Horario ${slot.time}${isBlocked ? ', bloqueado' : !slot.available ? ', no disponible' : ''}`}
                        accessibilityState={{ disabled: !slot.available, selected: isSelected }}
                        style={[
                          styles.timeSlot,
                          isSelected && styles.timeSlotSelected,
                          !slot.available && styles.timeSlotDisabled,
                          isBlocked && styles.timeSlotBlocked,
                          isInvalidByDuration && styles.timeSlotDurationInvalid,
                          isOverlap && !isBlocked && styles.timeSlotOverlap,
                        ]}
                        onPress={() => {
                          if (!slot.available) return;
                          Keyboard.dismiss();
                          if (selectedBlocks.length === 0) {
                            if (totalServiceDuration > 0) {
                              const blocks = Math.ceil(totalServiceDuration/30);
                              const thisIdx = timeSlots.findIndex(s => s.time === slot.time);
                              const range   = timeSlots.slice(thisIdx, thisIdx+blocks);
                              if (range.length === blocks && range.every(s => s.available)) {
                                setSelectedBlocks(range.map(s => s.time)); setTime(slot.time); return;
                              }
                            }
                            setSelectedBlocks([slot.time]); setTime(slot.time);
                          } else {
                            const firstIdx = timeSlots.findIndex(s => s.time === selectedBlocks[0]);
                            const thisIdx  = timeSlots.findIndex(s => s.time === slot.time);
                            if (thisIdx < firstIdx) { setSelectedBlocks([slot.time]); setTime(slot.time); }
                            else {
                              const range = timeSlots.slice(firstIdx, thisIdx+1);
                              if (range.every(s => s.available)) setSelectedBlocks(range.map(s => s.time));
                            }
                          }
                        }}
                        disabled={!slot.available}
                      >
                        <Text style={[
                          styles.timeSlotText,
                          isSelected && styles.timeSlotTextSelected,
                          !slot.available && styles.timeSlotTextDisabled,
                          isBlocked && styles.timeSlotTextBlocked,
                          isOverlap && !isBlocked && { color: '#F59E0B' },
                        ]}>{slot.time}</Text>
                        {isBlocked && (
                          <Text style={styles.timeSlotBlockedLabel} numberOfLines={1}>
                            {slot.blockedLabel?.toLowerCase().includes('comida') ? '🍽️' : '🚫'} {slot.blockedLabel?.slice(0, 8)}
                          </Text>
                        )}
                        {isInvalidByDuration && (
                          <Text style={styles.timeSlotDurationInvalidLabel} numberOfLines={1}>
                            No alcanza
                          </Text>
                        )}
                        {slot.isOverlap && !isBlocked && !isInvalidByDuration && <Text style={{ fontSize: 8, color: '#F59E0B' }}>⚡</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {selectedBlocks.length === 0 && timeSlots.some(s => s.available) && (
                  <Text style={styles.selectHint}>Selecciona un horario disponible</Text>
                )}

                {(timeSlots.some(s => s.isBlocked) || hasInvalidByDuration || timeSlots.some(s => s.isOverlap)) && (
                  <View style={styles.legendCol}>
                    {timeSlots.some(s => s.isBlocked) && (
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]} />
                        <Text style={styles.legendText}>Bloqueado por horario de comida o descanso</Text>
                      </View>
                    )}
                    {hasInvalidByDuration && (
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]} />
                        <Text style={styles.legendText}>
                          La duración ({durationLabel(totalServiceDuration)}) no alcanza antes del próximo bloqueo o cita
                        </Text>
                      </View>
                    )}
                    {timeSlots.some(s => s.isOverlap) && (
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' }]} />
                        <Text style={styles.legendText}>⚡ Horario con empalme permitido (se traslapa con otra cita)</Text>
                      </View>
                    )}
                  </View>
                )}
              </>
            )}
          </View>

          {/* Costo */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Costo {selectedServices.length > 1 ? 'total ' : ''}(MXN)</Text>
            <TextInput
              ref={costInputRef}
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              value={serviceCost}
              onChangeText={t => setServiceCost(t.replace(/[^0-9.]/g,''))}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Notas */}
          <View style={styles.section}>
            <Text style={styles.label}>Notas (opcional)</Text>
            <TextInput
              ref={notesInputRef}
              style={[styles.textInput, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              placeholder="Notas adicionales..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* WhatsApp */}
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <IconSymbol android_material_icon_name="message" size={20} color={colors.primary} />
                <Text style={styles.switchText}>Enviar confirmación por WhatsApp</Text>
              </View>
              <Switch value={sendWhatsApp} onValueChange={setSendWhatsApp} trackColor={{ false: '#D1D5DB', true: colors.primary }} thumbColor="#ffffff" />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, (loading || !canSave) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={loading || !canSave}
            activeOpacity={0.8}
          >
            {loading ? (
              <View style={styles.saveButtonContent}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.saveButtonText}>Guardando cita...</Text>
              </View>
            ) : (
              <Text style={styles.saveButtonText}>Guardar Cita</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* iOS Date Panel */}
      {Platform.OS === 'ios' && showDatePanel && (
        <>
          <TouchableOpacity style={styles.dateOverlay} activeOpacity={1} onPress={cancelDateIOS} />
          <View style={styles.datePanelContainer}>
            <View style={styles.datePanelHeader}>
              <TouchableOpacity onPress={cancelDateIOS}><Text style={styles.datePanelCancel}>Cancelar</Text></TouchableOpacity>
              <Text style={styles.datePanelTitle}>Seleccionar fecha</Text>
              <TouchableOpacity onPress={confirmDateIOS}><Text style={styles.datePanelConfirmText}>Listo</Text></TouchableOpacity>
            </View>
            <View style={styles.datePanelPreview}>
              <Text style={styles.datePanelPreviewText}>
                {formattedTempDate.charAt(0).toUpperCase()+formattedTempDate.slice(1)}
              </Text>
            </View>
            <DateTimePicker
              value={tempDate} mode="date" display="spinner" minimumDate={new Date()} locale="es-MX"
              onChange={(_event, selected) => { if (selected) setTempDate(selected); }}
              style={{ backgroundColor:'#ffffff', width:'100%' }} textColor="#0F172A"
            />
            <TouchableOpacity style={styles.datePanelConfirmBtn} onPress={confirmDateIOS}>
              <Text style={styles.datePanelConfirmBtnText}>Confirmar fecha</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {Platform.OS === 'android' && showDatePickerAndroid && (
        <DateTimePicker value={date} mode="date" display="default" minimumDate={new Date()} onChange={onAndroidDateChange} />
      )}

      {/* Modal selector de staff */}
      <Modal visible={showStaffPicker} animationType="slide" transparent onRequestClose={() => setShowStaffPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>¿Quién atiende?</Text>
              <TouchableOpacity onPress={() => setShowStaffPicker(false)}>
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }}>
              <TouchableOpacity
                style={[styles.staffItem, !selectedStaff && styles.staffItemSelected]}
                onPress={() => { setSelectedStaff(null); setShowStaffPicker(false); }}
              >
                <View style={[styles.staffItemAvatar, { backgroundColor: '#F1F5F9' }]}>
                  <MaterialIcons name="person" size={20} color="#94A3B8" />
                </View>
                <View style={styles.staffItemInfo}>
                  <Text style={styles.staffItemName}>Sin asignar</Text>
                  <Text style={styles.staffItemRole}>Cualquier colaborador puede atender</Text>
                </View>
                {!selectedStaff && <MaterialIcons name="check-circle" size={20} color="#10B981" />}
              </TouchableOpacity>

              {staffMembers.map(member => (
                <TouchableOpacity
                  key={member.id}
                  style={[styles.staffItem, selectedStaff?.id === member.id && styles.staffItemSelected]}
                  onPress={() => { setSelectedStaff(member); setShowStaffPicker(false); }}
                >
                  <View style={[styles.staffItemAvatar, { backgroundColor: member.color+'20', borderColor: member.color, borderWidth: 2 }]}>
                    <Text style={[styles.staffItemInitials, { color: member.color }]}>
                      {member.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.staffItemInfo}>
                    <Text style={styles.staffItemName}>{member.name}</Text>
                    {member.role ? <Text style={styles.staffItemRole}>{member.role}</Text> : null}
                  </View>
                  {selectedStaff?.id === member.id && <MaterialIcons name="check-circle" size={20} color="#10B981" />}
                </TouchableOpacity>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal catálogo */}
      <Modal visible={showServicePicker} animationType="slide" transparent onRequestClose={() => setShowServicePicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Catálogo de servicios</Text>
              <TouchableOpacity onPress={() => { setShowServicePicker(false); setServiceSearchQuery(''); }}>
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            {canUseMultiService && (
              <Text style={styles.multiHint}>Puedes elegir varios servicios — se suman duración y precio. Toca para agregar o quitar.</Text>
            )}
            <View style={styles.serviceSearch}>
              <MaterialIcons name="search" size={18} color="#94A3B8" />
              <TextInput
                style={styles.serviceSearchInput}
                value={serviceSearchQuery}
                onChangeText={setServiceSearchQuery}
                placeholder="Buscar servicio..."
                placeholderTextColor="#CBD5E1"
                autoFocus={false}
              />
              {serviceSearchQuery ? (
                <TouchableOpacity onPress={() => setServiceSearchQuery('')}>
                  <MaterialIcons name="close" size={16} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView style={styles.serviceList}>
              {filteredCatalogServices.length === 0 ? (
                <View style={styles.serviceEmpty}>
                  <MaterialIcons name="work-outline" size={40} color="#CBD5E1" />
                  <Text style={styles.serviceEmptyText}>
                    {serviceSearchQuery ? 'Sin resultados' : 'No tienes servicios en el catálogo'}
                  </Text>
                  {!serviceSearchQuery && (
                    <TouchableOpacity style={styles.serviceEmptyBtn} onPress={() => { setShowServicePicker(false); router.push('/settings/services'); }}>
                      <Text style={styles.serviceEmptyBtnText}>Ir al catálogo →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                filteredCatalogServices.map((svc) => {
                  const isPicked = selectedServices.some(s => s.id === svc.id);
                  return (
                  <TouchableOpacity
                    key={svc.id}
                    style={[styles.serviceItem, isPicked && styles.serviceItemSelected]}
                    onPress={() => handleToggleService(svc)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.serviceItemIcon}>
                      <MaterialIcons name={isPicked ? 'check-circle' : 'work-outline'} size={18} color="#10B981" />
                    </View>
                    <View style={styles.serviceItemInfo}>
                      <Text style={styles.serviceItemName}>{svc.name}</Text>
                      {svc.description ? <Text style={styles.serviceItemDesc}>{svc.description}</Text> : null}
                      <View style={styles.serviceItemMeta}>
                        <View style={styles.serviceMetaChip}>
                          <MaterialIcons name="access-time" size={11} color="#94A3B8" />
                          <Text style={styles.serviceMetaText}>{durationLabel(svc.durationMinutes)}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.serviceItemPrice}>
                      <Text style={styles.serviceItemPriceText}>${svc.price.toLocaleString('es-MX')}</Text>
                      <Text style={styles.serviceItemPriceSub}>MXN</Text>
                    </View>
                    {isPicked && (
                      <MaterialIcons name="check-circle" size={20} color="#10B981" style={{ marginLeft: 8 }} />
                    )}
                  </TouchableOpacity>
                  );
                })
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
            {canUseMultiService && selectedServices.length > 0 && (
              <TouchableOpacity style={styles.modalDoneBtn} onPress={() => { setShowServicePicker(false); setServiceSearchQuery(''); }}>
                <Text style={styles.modalDoneBtnText}>Listo · {selectedServices.length} servicio{selectedServices.length !== 1 ? 's' : ''} · ${totalServiceCost.toLocaleString('es-MX')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal clientes */}
      <Modal
        visible={showClientPicker}
        animationType="slide"
        transparent
        onRequestClose={() => { setShowClientPicker(false); setShowClientSearch(false); setSearchQuery(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Cliente</Text>
              <TouchableOpacity onPress={() => { setShowClientPicker(false); setShowClientSearch(false); setSearchQuery(''); }}>
                <IconSymbol android_material_icon_name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {showClientSearch ? (
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Buscar por nombre o teléfono..."
                placeholderTextColor={colors.textSecondary}
                autoFocus={true}
              />
            ) : (
              <TouchableOpacity
                style={styles.searchToggleBtn}
                onPress={() => setShowClientSearch(true)}
              >
                <MaterialIcons name="search" size={18} color="#94A3B8" />
                <Text style={styles.searchToggleBtnText}>Buscar por nombre...</Text>
              </TouchableOpacity>
            )}

            {/* Acceso rápido "+ Crear nuevo cliente" siempre visible arriba de la lista */}
            <TouchableOpacity style={styles.createClientFromModal} onPress={goToCreateClient}>
              <View style={styles.createClientIcon}>
                <MaterialIcons name="person-add-alt-1" size={18} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.createClientTitle}>Crear nuevo cliente</Text>
                <Text style={styles.createClientSubtitle}>Regresarás a esta cita con el cliente ya seleccionado</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#10B981" />
            </TouchableOpacity>

            <ScrollView style={styles.clientsList} keyboardShouldPersistTaps="handled">
              {filteredClients.length === 0 ? (
                <View style={styles.emptyClientState}>
                  <Text style={styles.emptyClientText}>
                    {searchQuery ? 'No se encontraron clientes' : 'No tienes clientes registrados'}
                  </Text>
                  {/* Botón en estado vacío también lleva a nuevo cliente preservando estado */}
                  <TouchableOpacity style={styles.addClientButton} onPress={goToCreateClient}>
                    <Text style={styles.addClientButtonText}>
                      {searchQuery ? `Agregar "${searchQuery}" como nuevo cliente` : 'Agregar cliente'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                filteredClients.map((client) => (
                  <TouchableOpacity
                    key={client.id}
                    style={styles.clientItem}
                    onPress={() => { setSelectedClient(client); setShowClientPicker(false); setShowClientSearch(false); setSearchQuery(''); }}
                  >
                    <View style={styles.clientAvatar}>
                      <Text style={styles.clientAvatarText}>{client.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.clientInfo}>
                      <Text style={styles.clientName}>{client.name}</Text>
                      <Text style={styles.clientPhone}>{client.phone}</Text>
                    </View>
                    {selectedClient?.id === client.id && (
                      <IconSymbol android_material_icon_name="check" size={24} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={errorModal.visible}
        title="Error"
        message={errorModal.message}
        buttons={[{ text: 'Aceptar', onPress: () => setErrorModal({ visible: false, message: '' }), style: 'default' }]}
        onDismiss={() => setErrorModal({ visible: false, message: '' })}
      />
    </SafeAreaView>
  );
}

export default function NewAppointmentScreen() {
  const router = useRouter();
  return (
    <ScreenErrorBoundary onBack={() => router.back()}>
      <NewAppointmentInner />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container:              { flex: 1, backgroundColor: colors.background },
  loadingWrap:            { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: colors.background },
  loadingText:            { fontSize: 14, color: colors.textSecondary },
  header:                 { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backButton:             { padding: 4 },
  title:                  { fontSize: 20, fontWeight: '600', color: colors.text },
  placeholder:            { width: 32 },
  content:                { flex: 1, padding: 20 },

  usageCard:              { borderRadius: 12, padding: 12, marginBottom: 20, borderWidth: 1.5 },
  usageHeader:            { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  usageTitle:             { fontSize: 13, fontWeight: '800' },
  usageDesc:              { fontSize: 11, color: '#64748B', marginTop: 1 },
  usageCount:             { fontSize: 16, fontWeight: '900' },
  usageProgressBg:        { height: 6, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' },
  usageProgressFill:      { height: '100%', borderRadius: 3 },

  section:                { marginBottom: 24 },
  inputGroup:             { marginBottom: 24 },
  labelRow:               { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  label:                  { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 },
  catalogBtn:             { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  catalogBtnText:         { fontSize: 12, fontWeight: '600', color: '#10B981' },
  input:                  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  inputActive:            { borderColor: colors.primary, borderWidth: 2 },
  inputText:              { fontSize: 16, color: colors.text },
  inputPlaceholder:       { fontSize: 16, color: colors.textSecondary },
  textInput:              { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: '#E5E7EB' },
  textArea:               { minHeight: 100 },
  catalogSelected:        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BBF7D0' },
  catalogSelectedIcon:    { width: 36, height: 36, borderRadius: 10, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center' },
  catalogSelectedInfo:    { flex: 1 },
  catalogSelectedName:    { fontSize: 15, fontWeight: '700', color: '#065F46' },
  catalogSelectedMeta:    { fontSize: 12, color: '#10B981', marginTop: 2, fontWeight: '500' },
  servicesBox:            { gap: 8 },
  serviceChip:            { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BBF7D0' },
  servicesTotalRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#10B981' },
  servicesTotalLabel:     { fontSize: 13, fontWeight: '700', color: '#065F46' },
  servicesTotalValue:     { fontSize: 15, fontWeight: '800', color: '#10B981' },
  addMoreBtn:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0', borderStyle: 'dashed', backgroundColor: '#F8FEFB' },
  addMoreBtnText:         { fontSize: 13, fontWeight: '700', color: '#10B981' },
  multiHint:              { fontSize: 12, color: '#10B981', fontWeight: '600', paddingHorizontal: 20, paddingTop: 12 },
  modalDoneBtn:           { backgroundColor: '#10B981', marginHorizontal: 16, marginBottom: 16, marginTop: 4, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalDoneBtnText:       { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  staffPreview:           { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  staffDot:               { width: 10, height: 10, borderRadius: 5 },
  staffRoleInline:        { fontSize: 13, color: colors.textSecondary },
  dayClosedContainer:     { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 16, marginTop: 8 },
  dayClosedText:          { fontSize: 15, fontWeight: '600', color: '#EF4444', textAlign: 'center' },
  dayClosedSubtext:       { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 4 },
  durationBadge:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, borderWidth: 1, borderColor: '#10B981' },
  durationText:           { fontSize: 13, fontWeight: '700', color: '#10B981' },
  durationClear:          { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  timeSlotOverlap:        { borderWidth: 1, borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
  timeSlotsContainer:     { flexDirection: 'row' },
  timeSlot:               { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8, alignItems: 'center', minWidth: 80 },
  timeSlotSelected:       { backgroundColor: colors.primary, borderColor: colors.primary },
  timeSlotDisabled:       { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  timeSlotBlocked:        { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  timeSlotDurationInvalid: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  timeSlotText:           { fontSize: 14, fontWeight: '500', color: colors.text },
  timeSlotTextSelected:   { color: '#ffffff' },
  timeSlotTextDisabled:   { color: '#9CA3AF' },
  timeSlotTextBlocked:    { color: '#92400E', fontWeight: '600' },
  timeSlotBlockedLabel:   { fontSize: 9, color: '#92400E', marginTop: 2, fontWeight: '600' },
  timeSlotDurationInvalidLabel: { fontSize: 9, color: '#991B1B', marginTop: 2, fontWeight: '700' },
  legendCol:              { marginTop: 10, gap: 6 },
  legendItem:             { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  legendDot:              { width: 10, height: 10, borderRadius: 3, borderWidth: 1, marginTop: 2 },
  legendText:             { flex: 1, fontSize: 11, color: '#64748B', fontStyle: 'italic', lineHeight: 15 },
  selectHint:             { fontSize: 13, color: '#F59E0B', fontWeight: '600', marginTop: 8, marginLeft: 2 },
  switchRow:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', borderRadius: 12, padding: 16 },
  switchLabel:            { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  switchText:             { fontSize: 16, fontWeight: '600', color: colors.text },
  // ⚡ saveButton: marginBottom eliminado para que el botón quede pegado al final
  // del ScrollView; el paddingBottom dinámico del contentContainerStyle se encarga
  // de respetar la zona de tolerancia (insets.bottom de la safe-area).
  saveButton:             { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  saveButtonDisabled:     { opacity: 0.6 },
  saveButtonContent:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  saveButtonText:         { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  dateOverlay:            { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.40)' },
  datePanelContainer:     { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  datePanelHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  datePanelTitle:         { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  datePanelCancel:        { fontSize: 15, color: '#94A3B8', fontWeight: '500' },
  datePanelConfirmText:   { fontSize: 15, color: '#10B981', fontWeight: '700' },
  datePanelPreview:       { alignItems: 'center', paddingVertical: 12, marginHorizontal: 20, marginTop: 14, backgroundColor: '#F0FDF4', borderRadius: 12, borderWidth: 0.5, borderColor: '#BBF7D0' },
  datePanelPreviewText:   { fontSize: 15, fontWeight: '600', color: '#10B981', textTransform: 'capitalize' },
  datePanelConfirmBtn:    { backgroundColor: '#10B981', marginHorizontal: 20, marginTop: 12, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  datePanelConfirmBtnText:{ fontSize: 16, fontWeight: '700', color: '#ffffff' },
  modalOverlay:           { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:           { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  modalHeader:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  modalTitle:             { fontSize: 18, fontWeight: '700', color: colors.text },
  staffItem:              { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: '#E2E8F0' },
  staffItemSelected:      { borderColor: '#10B981', borderWidth: 1.5, backgroundColor: '#F0FDF4' },
  staffItemAvatar:        { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  staffItemInitials:      { fontSize: 15, fontWeight: '800' },
  staffItemInfo:          { flex: 1 },
  staffItemName:          { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  staffItemRole:          { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  serviceSearch:          { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 12, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 0.5, borderColor: '#E2E8F0' },
  serviceSearchInput:     { flex: 1, fontSize: 14, color: '#0F172A' },
  serviceList:            { padding: 16 },
  serviceEmpty:           { alignItems: 'center', paddingVertical: 40, gap: 10 },
  serviceEmptyText:       { fontSize: 15, color: '#94A3B8', textAlign: 'center' },
  serviceEmptyBtn:        { backgroundColor: '#ECFDF5', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  serviceEmptyBtnText:    { color: '#10B981', fontWeight: '700', fontSize: 14 },
  serviceItem:            { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: '#E2E8F0' },
  serviceItemSelected:    { borderColor: '#10B981', borderWidth: 1.5, backgroundColor: '#F0FDF4' },
  serviceItemIcon:        { width: 38, height: 38, borderRadius: 10, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center' },
  serviceItemInfo:        { flex: 1 },
  serviceItemName:        { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  serviceItemDesc:        { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  serviceItemMeta:        { flexDirection: 'row', gap: 8, marginTop: 5 },
  serviceMetaChip:        { flexDirection: 'row', alignItems: 'center', gap: 3 },
  serviceMetaText:        { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  serviceItemPrice:       { alignItems: 'flex-end' },
  serviceItemPriceText:   { fontSize: 16, fontWeight: '800', color: '#10B981' },
  serviceItemPriceSub:    { fontSize: 10, color: '#94A3B8' },
  searchInput:            { backgroundColor: colors.background, borderRadius: 12, padding: 12, margin: 20, marginBottom: 0, fontSize: 16, color: colors.text },
  searchToggleBtn:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 12, margin: 20, marginBottom: 0, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 0.5, borderColor: '#E2E8F0' },
  searchToggleBtnText:    { fontSize: 14, color: '#94A3B8' },
  // Botón "+ Crear nuevo cliente" dentro del modal de selección
  createClientFromModal:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F0FDF4', borderRadius: 12, marginHorizontal: 20, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#BBF7D0' },
  createClientIcon:       { width: 36, height: 36, borderRadius: 10, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center' },
  createClientTitle:      { fontSize: 14, fontWeight: '700', color: '#065F46' },
  createClientSubtitle:   { fontSize: 11, color: '#10B981', marginTop: 1, fontWeight: '500' },
  clientsList:            { paddingHorizontal: 20, paddingTop: 12 },
  emptyClientState:       { alignItems: 'center', paddingVertical: 40 },
  emptyClientText:        { fontSize: 16, color: colors.textSecondary, marginBottom: 16 },
  addClientButton:        { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  addClientButtonText:    { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  clientItem:             { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  clientAvatar:           { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  clientAvatarText:       { fontSize: 20, fontWeight: '600', color: '#ffffff' },
  clientInfo:             { flex: 1 },
  clientName:             { fontSize: 16, fontWeight: '600', color: colors.text },
  clientPhone:            { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
});

// Estilos del ErrorBoundary fallback
const errorStyles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.background },
  content:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  iconWrap:     { width: 96, height: 96, borderRadius: 48, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  title:        { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  desc:         { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  errorMsg:     { fontSize: 12, color: '#EF4444', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'center', marginTop: 8, padding: 12, backgroundColor: '#FEF2F2', borderRadius: 8, alignSelf: 'stretch' },
  backBtn:      { backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, marginTop: 16 },
  backBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
});
