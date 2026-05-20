import { useEffect, useRef } from 'react';
import { subscribeToAppRefresh } from '@/contexts/AppStateContext';

// ═════════════════════════════════════════════════════════════════
// useAppRefreshListener — Hook para refetchear datos cuando la app
// vuelve de background después de un período significativo.
//
// PROBLEMA QUE RESUELVE:
//   Cuando el usuario minimiza la app y vuelve después de >5 min:
//   1. AppStateContext invalida el cache automáticamente
//   2. Pero los componentes activos NO se enteran del cache borrado
//   3. Siguen mostrando el estado de React (datos viejos)
//   4. Resultado: el usuario ve la app "colgada" con info desactualizada
//
// SOLUCIÓN:
//   AppStateContext emite un evento `appRefreshed` cuando termina el
//   refresh exitoso. Las pantallas que quieran refetchear sus datos
//   subscriben con este hook.
//
// USO:
//   import { useAppRefreshListener } from '@/hooks/useAppRefreshListener';
//
//   function MyScreen() {
//     const loadData = useCallback(async () => {
//       // tu lógica de refetch
//     }, []);
//
//     // Carga inicial
//     useEffect(() => { loadData(); }, []);
//
//     // Refetch automático cuando vuelve la app de background
//     useAppRefreshListener(loadData);
//   }
//
// NOTAS:
//   - El callback se ejecuta SOLO si se hizo un refresh real (>5 min en bg).
//   - Si la pantalla se desmonta antes del refresh, el listener se limpia
//     automáticamente (sin memory leaks).
//   - Si el callback cambia entre renders, usamos una ref para que la
//     suscripción no se recree innecesariamente (mejor performance).
// ═════════════════════════════════════════════════════════════════

export function useAppRefreshListener(onRefresh: () => void): void {
  // Ref a la función más reciente: así no necesitamos resuscribir
  // cada vez que la función cambia (lo cual sería ineficiente)
  const callbackRef = useRef(onRefresh);

  useEffect(() => {
    callbackRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    // Suscribir al evento global. subscribeToAppRefresh devuelve la
    // función de cleanup que removerá el listener al desmontar.
    const unsubscribe = subscribeToAppRefresh(() => {
      try {
        callbackRef.current();
      } catch (err) {
        // Capturamos para que un error del caller no rompa otros listeners
        // El AppStateContext también tiene su propio try/catch como segunda defensa.
        console.warn('[useAppRefreshListener] callback threw:', err);
      }
    });

    return unsubscribe;
  }, []); // ← Deps vacías intencionalmente: el callback se accede via ref
}
