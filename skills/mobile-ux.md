# SKILL: Mobile UX — Diseño para Apps Móviles (2025)

Este skill guía a Claude para tomar decisiones de UX/UI en aplicaciones móviles React Native, priorizando usabilidad real, conversión y retención.

---

## PRINCIPIOS FUNDAMENTALES

### 1. Thumb Zone (Zona del pulgar)
El área cómoda de toque está en la mitad inferior de la pantalla.
- **Acciones primarias** → abajo (botones de acción, CTA principal)
- **Navegación** → tab bar abajo, nunca arriba
- **Acciones destructivas** → difíciles de alcanzar por error (arriba o requieren confirmación)

### 2. Touch Target mínimo
- Mínimo **44×44pt** en iOS, **48×48dp** en Android
- Nunca colocar dos targets tocables a menos de 8pt de distancia
- Iconos pequeños siempre con padding invisible alrededor

### 3. Feedback inmediato
Cada acción del usuario debe tener respuesta visual en < 100ms:
```tsx
<TouchableOpacity activeOpacity={0.7} onPress={...}>
// ✅ activeOpacity da feedback inmediato

<TouchableHighlight underlayColor="#E2E8F0" onPress={...}>
// ✅ alternativa con highlight
```

---

## LAYOUT Y ESPACIADO

### Sistema de espaciado (múltiplos de 4)
```
4pt  — separación mínima entre elementos
8pt  — padding interno pequeño
12pt — gap entre elementos relacionados
16pt — padding estándar de sección
20pt — padding horizontal de pantalla
24pt — padding de card
32pt — separación entre secciones
40pt — espaciado generoso / hero areas
```

### Padding horizontal de pantalla
Siempre `paddingHorizontal: 20` en el ScrollView principal. Nunca menos de 16.

### Cards
```tsx
styles.card = {
  borderRadius: 12,      // mínimo recomendado
  padding: 16,
  // Sombra sutil — no exagerada
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 4,
  elevation: 2,           // Android
};
```

---

## TIPOGRAFÍA MÓVIL

### Jerarquía recomendada
```
Título de pantalla:  18-20px, fontWeight: '700'
Título de sección:   16-17px, fontWeight: '700'
Contenido principal: 15-16px, fontWeight: '500'
Texto secundario:    13-14px, fontWeight: '400'
Etiquetas/labels:    11-12px, fontWeight: '600'
```

### Reglas de legibilidad
- Mínimo `fontSize: 12` en cualquier texto visible
- Contraste mínimo 4.5:1 para texto normal, 3:1 para texto grande
- `lineHeight` = `fontSize * 1.4` para cuerpo de texto
- Evitar `fontWeight: '300'` o lighter en móvil — difícil de leer

### Números en stats/dashboard
- Números grandes (KPIs): `fontSize: 24-32`, `fontWeight: '700'`
- Si el valor puede ser texto largo (fecha, nombre), NO usar fontSize > 16 en card angosta
- Solución para stats mixtos: separar cards numéricas de cards de texto

```tsx
// ✅ Patrón correcto: números en fila, texto en card ancha
<View style={{ flexDirection: 'row', gap: 12 }}>
  <StatCard value="42" label="Total Citas" />
  <StatCard value="87%" label="Asistencia" />
</View>
<WideStatCard icon="event" label="Última visita" value="24 mar '26" />
```

---

## FORMULARIOS

### Orden de campos (reducir fricción)
1. Campo más importante / fácil primero
2. Campos opcionales al final
3. Nunca más de 5-6 campos en una pantalla
4. Agrupar campos relacionados visualmente

### Labels y placeholders
```tsx
// ✅ Label encima + placeholder descriptivo
<Text style={styles.label}>Nombre *</Text>
<TextInput placeholder="Ej: María García" />

// ❌ Solo placeholder como label (desaparece al escribir)
<TextInput placeholder="Nombre" />
```

### Teclado correcto por tipo de dato
```tsx
keyboardType="default"        // texto libre
keyboardType="email-address"  // emails
keyboardType="phone-pad"      // teléfonos
keyboardType="numeric"        // solo números
keyboardType="decimal-pad"    // precios
```

### Bottom sheets con teclado
Siempre `<Modal>` + `<KeyboardAvoidingView>` + `<ScrollView keyboardShouldPersistTaps="handled">`.
Nunca `position: absolute` para formularios — el teclado los tapará.

---

## ESTADOS DE UI

Toda pantalla debe manejar estos 5 estados:

```
1. Loading    → ActivityIndicator centrado, no skeleton si < 500ms
2. Empty      → Ícono + mensaje + CTA (nunca solo "No hay datos")
3. Error      → Mensaje claro + botón de reintentar
4. Success    → Feedback positivo (Alert, toast, animación)
5. Content    → El estado normal con datos
```

### Empty state bien hecho
```tsx
<View style={styles.emptyState}>
  <MaterialIcons name="calendar-today" size={48} color={colors.textMuted} />
  <Text style={styles.emptyTitle}>Sin citas registradas</Text>
  <Text style={styles.emptySub}>Agenda la primera cita de este cliente</Text>
  <TouchableOpacity style={styles.emptyBtn} onPress={...}>
    <Text>Agendar cita</Text>
  </TouchableOpacity>
</View>
```

### Loading states
- Para cargas < 300ms: no mostrar loading (evita flash)
- Para cargas 300ms-2s: `ActivityIndicator`
- Para cargas > 2s: skeleton screens

---

## NAVEGACIÓN Y FLUJOS

### Tab Bar — máximo 5 tabs
Cada tab debe ser:
- Una sección distinta y recurrente
- Accesible en 1 tap desde cualquier lugar
- Con ícono + label (nunca solo ícono en apps de negocio)

### Jerarquía de navegación
```
Tab (nivel 0) → Lista (nivel 1) → Detalle (nivel 2) → Edición (nivel 3)
```
Nunca más de 3 niveles de profundidad en un flujo.

### Back navigation
- Siempre visible en pantallas de nivel 2+
- Icono estándar: `arrow-back` (Android) / `chevron.left` (iOS)
- Al cancelar formulario con cambios: pedir confirmación

---

## COLORES Y TEMAS

### Semántica de colores en apps de servicio
```
Verde (#10B981)   → Confirmado, exitoso, activo, CTA principal
Azul  (#3B82F6)   → Información, link, acción secundaria
Ambar (#F59E0B)   → Pendiente, advertencia, en espera
Rojo  (#EF4444)   → Error, cancelado, eliminado, peligro
Gris  (#6B7280)   → Deshabilitado, completado, neutro
```

### Dark mode — errores comunes
- No usar `opacity` para texto en dark mode (queda ilegible)
- Sombras en dark mode deben ser casi transparentes o eliminadas
- Cards en dark: `surface` debe ser distinto de `bg` (al menos 8% más claro)
- Nunca `#000000` puro como fondo dark — usar `#0F172A` o similar

---

## MICRO-INTERACCIONES

### Botones de carga
```tsx
<TouchableOpacity
  style={[styles.btn, loading && { opacity: 0.6 }]}
  onPress={handleSubmit}
  disabled={loading}
>
  {loading
    ? <ActivityIndicator color="#fff" size="small" />
    : <Text style={styles.btnText}>Guardar</Text>
  }
</TouchableOpacity>
```

### Pull to refresh
```tsx
<ScrollView
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      tintColor={colors.primary}
    />
  }
/>
```

### Swipe to delete (listas)
Usar `react-native-gesture-handler` con `Swipeable` para acciones de lista.
Siempre pedir confirmación antes de eliminar.

---

## PATRONES PARA APPS DE SERVICIO (VYLTA)

### Dashboard del día
- KPIs más importantes arriba (citas hoy, pendientes de confirmar)
- Lista de citas del día ordenada por hora
- Acceso rápido a "Nueva cita" en posición prominente

### Listados de clientes
- Avatar con iniciales + nombre + teléfono
- Búsqueda siempre visible (no oculta detrás de ícono)
- Filtros secundarios (activos/inactivos, etc.)
- Pull to refresh

### Detalle de cita
- Estado visible y prominente arriba
- Acciones contextuales según estado (no mostrar todas siempre)
- Información del cliente con acceso directo a su perfil

### Formulario de nueva cita
- Selector de cliente primero (el más importante)
- Selector de servicio con precio visible
- Calendario/fecha y hora
- Notas opcionales al final
- Botón de guardar siempre visible (no enterrado al final de scroll)

---

## ACCESIBILIDAD BÁSICA

```tsx
// Siempre en botones icónicos
<TouchableOpacity accessibilityLabel="Eliminar cita" accessibilityRole="button">
  <MaterialIcons name="delete" size={24} />
</TouchableOpacity>

// En imágenes
<Image accessibilityLabel="Avatar de María García" />
```

---

## CHECKLIST ANTES DE HACER COMMIT DE UI

- [ ] ¿Funciona en dark mode Y light mode?
- [ ] ¿Los TextInput suben con el teclado?
- [ ] ¿Los touch targets miden al menos 44pt?
- [ ] ¿Los estados empty/loading/error están manejados?
- [ ] ¿La tipografía es legible (min 12px, contraste suficiente)?
- [ ] ¿Las fechas muestran formato corto y sin bug de timezone?
- [ ] ¿Las acciones destructivas piden confirmación?
- [ ] ¿El scroll funciona cuando el teclado está abierto?
