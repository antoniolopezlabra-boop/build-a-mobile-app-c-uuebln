# SKILL: React Native + Expo (2025)

Este skill guía a Claude para escribir código React Native + Expo de calidad de producción, siguiendo patrones modernos del ecosistema 2024-2025.

---

## STACK DE REFERENCIA

- **Expo SDK 51+** con Expo Router v3 (file-based routing)
- **React Native 0.74+**
- **TypeScript** obligatorio en todos los archivos
- **Supabase** como backend (auth + DB + storage + edge functions)
- **NativeWind o StyleSheet** — preferir StyleSheet nativo para performance
- **Expo Go** para desarrollo, **EAS Build** para distribución

---

## REGLAS DE ARQUITECTURA

### Estructura de carpetas (Expo Router)
```
app/                    # Rutas (file-based)
  _layout.tsx           # Root layout, providers
  (tabs)/               # Tab navigator
    _layout.tsx
    index.tsx
  feature/
    [id].tsx            # Ruta dinámica
components/             # Componentes reutilizables
contexts/               # React Context providers
hooks/                  # Custom hooks
utils/                  # Helpers, api.ts, etc.
styles/                 # commonStyles, colores globales
lib/                    # supabase.ts, stripe.ts, etc.
```

### Providers en _layout.tsx
Siempre envolver en este orden:
```tsx
<ThemeProvider>
  <AuthProvider>
    <Stack />
  </AuthProvider>
</ThemeProvider>
```

---

## PATRONES DE COMPONENTES

### Componente estándar con tema
```tsx
import { useTheme } from '@/contexts/ThemeContext';

export default function MyScreen() {
  const { colors: tc } = useTheme();
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
      <Text style={{ color: tc.text }}>Hola</Text>
    </SafeAreaView>
  );
}
```

### Nunca usar colores hardcodeados en componentes
❌ `color: '#0F172A'`  
✅ `color: tc.text`

### SafeAreaView siempre con edges explícitos
```tsx
<SafeAreaView edges={['top']} style={...}>
```

---

## NAVEGACIÓN (Expo Router)

```tsx
import { useRouter, useLocalSearchParams } from 'expo-router';

// Navegar
router.push('/clients/123');
router.back();
router.replace('/home');

// Recibir params
const { id } = useLocalSearchParams<{ id: string }>();
const safeId = Array.isArray(id) ? id[0] : id;
```

### Rutas dinámicas: siempre validar array
```tsx
// ❌ Peligroso
const { id } = useLocalSearchParams();

// ✅ Seguro
const params = useLocalSearchParams();
const id = Array.isArray(params.id) ? params.id[0] : params.id;
```

---

## TECLADO Y FORMULARIOS

### Bottom sheet con teclado — patrón obligatorio
```tsx
import { Modal, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

<Modal visible={visible} transparent animationType="slide">
  <KeyboardAvoidingView
    style={{ flex: 1, justifyContent: 'flex-end' }}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  >
    <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} />
    <View style={styles.sheet}>
      <ScrollView keyboardShouldPersistTaps="handled">
        {/* inputs aquí */}
      </ScrollView>
    </View>
  </KeyboardAvoidingView>
</Modal>
```

### Nunca usar position: absolute para modales con inputs
Siempre usar `<Modal>` nativo de React Native para bottom sheets y modales con TextInput.

### TextInput: propiedades recomendadas
```tsx
<TextInput
  returnKeyType="next"          // para flujo entre campos
  keyboardType="email-address"  // según el tipo de dato
  autoCapitalize="none"         // para emails
  autoCorrect={false}           // para campos técnicos
  placeholderTextColor={tc.textMuted}
/>
```

---

## FECHAS — BUGS COMUNES

### Timezone bug al parsear fechas de Supabase
```tsx
// ❌ Bug: '2026-03-24' se interpreta como UTC medianoche → puede mostrar día anterior
new Date('2026-03-24')

// ✅ Correcto: forzar mediodía local
new Date('2026-03-24' + 'T12:00:00')
```

### Formato de fecha compacto y legible
```tsx
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr + 'T12:00:00');
  const day = date.getDate();
  const month = date.toLocaleString('es-MX', { month: 'short' });
  const year = date.getFullYear().toString().slice(-2);
  return `${day} ${month} '${year}`; // → "24 mar '26"
};
```

---

## SUPABASE + RLS

### Cliente singleton
```ts
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const supabase = createClient(URL, ANON_KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true },
});
```

### Siempre filtrar por user_id
```ts
// ❌ Inseguro (aunque RLS lo bloquee, es mala práctica)
await supabase.from('appointments').select('*');

// ✅ Correcto
const userId = await getCurrentUserId();
await supabase.from('appointments').select('*').eq('user_id', userId);
```

### Manejo de errores Supabase
```ts
const { data, error } = await supabase.from('clients').select('*');
if (error) throw error; // nunca ignorar el error silenciosamente
```

---

## PERFORMANCE

### Cache de datos
- Implementar cache key-value en memoria con TTL (ej: 60s para listas)
- Invalidar cache explícitamente tras mutaciones: `invalidateCache('clients_list')`
- Usar `Promise.all()` para cargas paralelas, nunca en secuencia

### FlatList vs ScrollView
- **FlatList** para listas > 20 items (virtualización)
- **ScrollView** para contenido estático o listas cortas (<20)
- Siempre pasar `keyExtractor` a FlatList

### Imágenes
```tsx
<Image
  source={{ uri: url }}
  style={styles.img}
  resizeMode="cover"
  // Para avatares remotos, siempre tener fallback
/>
```

---

## THEMING DARK/LIGHT

### Paleta mínima requerida en ThemeContext
```ts
const LIGHT = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  inputBg: '#F1F5F9',
  inputBorder: '#CBD5E1',
};

const DARK = {
  bg: '#0F172A',
  surface: '#1E293B',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  border: '#334155',
  inputBg: '#1E293B',
  inputBorder: '#475569',
};
```

### Persistencia con AsyncStorage
```ts
const saved = await AsyncStorage.getItem('vylta_theme');
if (saved === 'dark' || saved === 'light') setMode(saved);
```

---

## ANTI-PATRONES A EVITAR

| ❌ Evitar | ✅ Hacer en su lugar |
|-----------|---------------------|
| `console.log` en producción | Usar `logger.ts` con niveles |
| Colores hardcodeados | `tc.text`, `tc.bg`, etc. |
| `position: absolute` para modales con inputs | `<Modal>` nativo |
| Parsear fechas ISO sin timezone | Agregar `T12:00:00` |
| Queries sin `user_id` filter | Siempre filtrar por usuario |
| Fetch secuencial | `Promise.all()` paralelo |
| `any` en TypeScript | Tipar correctamente |
| Mutación directa de estado | Inmutabilidad con spread |

---

## EAS BUILD — CHECKLIST

```bash
# Instalar EAS CLI
npm install -g eas-cli
eas login

# Configurar proyecto
eas build:configure

# Build Android (.apk para beta)
eas build --platform android --profile preview

# Build iOS (.ipa)
eas build --platform ios --profile preview
```

### eas.json mínimo
```json
{
  "build": {
    "preview": {
      "android": { "buildType": "apk" },
      "ios": { "simulator": false }
    },
    "production": {
      "autoIncrement": true
    }
  }
}
```
