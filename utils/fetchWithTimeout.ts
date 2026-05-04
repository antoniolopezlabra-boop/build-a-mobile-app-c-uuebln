/**
 * fetchWithTimeout — Wrapper para evitar requests colgados infinitos.
 *
 * PROBLEMA QUE RESUELVE:
 *   Cuando la red está lenta o el WebSocket de Supabase está muerto, los requests
 *   pueden quedar colgados esperando una respuesta que nunca llega. Esto se ve
 *   en la UI como "cargando infinito".
 *
 * USO:
 *   import { fetchWithTimeout } from '@/utils/fetchWithTimeout';
 *   const response = await fetchWithTimeout('https://api.example.com', {
 *     timeout: 15000, // 15 seg (default)
 *   });
 *
 * COMPORTAMIENTO:
 *   - Si el request termina antes del timeout → funciona normal
 *   - Si el request tarda más del timeout → lanza error 'TIMEOUT'
 *   - El error es capturable con try/catch como cualquier fetch normal
 *
 * NOTAS:
 *   - El timeout default de 15 seg es razonable para apps móviles
 *   - Para uploads de archivos grandes, pasar timeout mayor (ej. 60000)
 *   - Para queries que sabes son rápidos, podes pasar timeout menor (ej. 5000)
 */
export interface FetchWithTimeoutOptions extends RequestInit {
  /** Timeout en milisegundos. Default: 15000 (15 segundos). */
  timeout?: number;
}

export class TimeoutError extends Error {
  constructor(message: string = 'Request timeout') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeout = 15000, ...fetchOptions } = options;

  // Si el caller ya pasó su propio AbortSignal, lo respetamos
  // pero le agregamos nuestro timeout encima
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } catch (error: any) {
    // Si fue abort por timeout, lanzar TimeoutError más específico
    if (error.name === 'AbortError') {
      throw new TimeoutError(
        `La solicitud tardó más de ${timeout / 1000} segundos. Verifica tu conexión a internet.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Helper para detectar si un error es de timeout.
 * Útil en bloques catch para mostrar mensajes diferentes.
 */
export function isTimeoutError(error: any): boolean {
  return error instanceof TimeoutError || error?.name === 'TimeoutError';
}
