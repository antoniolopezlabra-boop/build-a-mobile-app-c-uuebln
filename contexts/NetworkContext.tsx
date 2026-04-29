import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import * as Network from 'expo-network';
import { AppState, AppStateStatus } from 'react-native';

// ══════════════════════════════════════════════════════════════════
// NetworkContext — Monitoreo de estado de red
// Detecta conexión a internet y notifica a la app cuando cambia.
// Útil para mostrar banners offline, deshabilitar acciones críticas,
// y dar feedback claro al usuario en lugar de fallar silenciosamente.
// ══════════════════════════════════════════════════════════════════

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string | null;
  // Indica si acabamos de recuperar conexión (útil para refresh automático)
  justReconnected: boolean;
}

interface NetworkContextValue extends NetworkState {
  checkConnection: () => Promise<boolean>;
}

const NetworkContext = createContext<NetworkContextValue>({
  isConnected: true,
  isInternetReachable: true,
  type: null,
  justReconnected: false,
  checkConnection: async () => true,
});

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: true,
    type: null,
    justReconnected: false,
  });

  // Track previous connection to detect transition offline → online
  const wasConnectedRef = useRef<boolean>(true);
  const justReconnectedTimerRef = useRef<NodeJS.Timeout | null>(null);

  const checkConnection = async (): Promise<boolean> => {
    try {
      const networkState = await Network.getNetworkStateAsync();
      const isConnected = networkState.isConnected ?? false;
      const isInternetReachable = networkState.isInternetReachable ?? null;
      const type = networkState.type ?? null;

      // Detectar reconexión: estaba offline y ahora está online
      const wasOffline = !wasConnectedRef.current;
      const justReconnected = wasOffline && isConnected;

      setState({
        isConnected,
        isInternetReachable,
        type,
        justReconnected,
      });

      wasConnectedRef.current = isConnected;

      // Reset justReconnected flag después de 3 segundos
      // (suficiente para que las pantallas hagan refresh)
      if (justReconnected) {
        if (justReconnectedTimerRef.current) clearTimeout(justReconnectedTimerRef.current);
        justReconnectedTimerRef.current = setTimeout(() => {
          setState(prev => ({ ...prev, justReconnected: false }));
        }, 3000);
      }

      return isConnected;
    } catch (err) {
      console.error('[Network] Error checking connection:', err);
      return false;
    }
  };

  useEffect(() => {
    // Check inicial
    checkConnection();

    // Polling cada 10 segundos cuando la app está activa
    const intervalId = setInterval(() => {
      checkConnection();
    }, 10000);

    // Re-check cuando la app vuelve a foreground
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkConnection();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      clearInterval(intervalId);
      subscription.remove();
      if (justReconnectedTimerRef.current) clearTimeout(justReconnectedTimerRef.current);
    };
  }, []);

  return (
    <NetworkContext.Provider value={{ ...state, checkConnection }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) throw new Error('useNetwork must be used within NetworkProvider');
  return context;
};
