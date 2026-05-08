// utils/generateQrPdf.ts
//
// Genera un PDF imprimible (formato carta 8.5"x11") con el QR del link público
// del negocio, embedando opcionalmente el logo en el centro del QR.
//
// Estrategia técnica:
// 1. react-native-qrcode-svg renderiza un componente SVG con el QR
// 2. Capturamos ese SVG y lo convertimos a string XML
// 3. Construimos un HTML que incluye el SVG inline + diseño del PDF
// 4. expo-print convierte ese HTML a PDF nativo
// 5. expo-sharing abre el share sheet para que el usuario guarde/imprima
//
// Notas:
// - El logo se descarga como base64 antes de generar el HTML (evita CORS y
//   problemas de carga en el motor de PDF)
// - Si el logo falla por cualquier razón, el QR se genera limpio (fallback graceful)

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

// ──────── Tipos ────────

export interface QrPdfData {
  businessName: string;
  publicUrl: string;
  logoUrl?: string | null;
}

export type QrPdfResult =
  | { ok: true; uri: string }
  | { ok: false; error: string };

// ──────── Helpers ────────

/**
 * Descarga una imagen de URL y la convierte a base64 data URI.
 * Retorna null si falla — el PDF se genera sin logo en ese caso.
 */
async function fetchImageAsDataUri(url: string): Promise<string | null> {
  try {
    const tempPath = `${FileSystem.cacheDirectory}qr-logo-${Date.now()}.tmp`;
    const downloadResult = await FileSystem.downloadAsync(url, tempPath);

    if (downloadResult.status !== 200) {
      console.warn('[generateQrPdf] Logo download status:', downloadResult.status);
      return null;
    }

    const base64 = await FileSystem.readAsStringAsync(downloadResult.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const lower = url.toLowerCase();
    let mime = 'image/png';
    if (lower.includes('.jpg') || lower.includes('.jpeg')) mime = 'image/jpeg';
    else if (lower.includes('.webp')) mime = 'image/webp';
    else if (lower.includes('.gif')) mime = 'image/gif';

    FileSystem.deleteAsync(downloadResult.uri, { idempotent: true }).catch(() => {});

    return `data:${mime};base64,${base64}`;
  } catch (err) {
    console.warn('[generateQrPdf] Failed to fetch logo:', err);
    return null;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeFileName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'vylta'
  );
}

// ──────── HTML Template del PDF ────────

interface BuildHtmlArgs {
  businessName: string;
  publicUrl: string;
  qrSvgString: string;
  logoDataUri: string | null;
}

function buildPdfHtml({
  businessName,
  publicUrl,
  qrSvgString,
  logoDataUri,
}: BuildHtmlArgs): string {
  const safeName = escapeHtml(businessName);
  const safeUrl = escapeHtml(publicUrl);

  const logoHtml = logoDataUri
    ? `<div class="logo-overlay">
         <div class="logo-bg">
           <img src="${escapeHtml(logoDataUri)}" alt="Logo del negocio" class="logo-img" />
         </div>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>QR — ${safeName}</title>
  <style>
    @page { size: letter; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 8.5in; height: 11in; font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0F172A; background: #FFFFFF; }
    .page { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 0.7in 0.6in; }
    .header { text-align: center; width: 100%; }
    .tagline { font-size: 11pt; color: #94A3B8; letter-spacing: 2pt; font-weight: 500; margin-bottom: 8pt; }
    .business-name { font-size: 28pt; font-weight: 700; color: #0F172A; line-height: 1.15; letter-spacing: -0.3pt; max-width: 6in; margin: 0 auto; word-wrap: break-word; }
    .qr-section { flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; }
    .qr-frame { position: relative; padding: 0.2in; background: #FFFFFF; border: 0.5pt solid #F1F5F9; border-radius: 12pt; }
    .qr-svg-wrap svg { display: block; width: 3.4in; height: 3.4in; }
    .logo-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center; }
    .logo-bg { width: 0.75in; height: 0.75in; background: #FFFFFF; padding: 4pt; display: flex; align-items: center; justify-content: center; }
    .logo-img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .url-section { text-align: center; width: 100%; }
    .scan-instruction { font-size: 13pt; color: #475569; margin-bottom: 6pt; }
    .or-visit { font-size: 10pt; color: #94A3B8; margin-bottom: 8pt; }
    .url { font-size: 12pt; color: #0F172A; font-weight: 500; word-break: break-all; max-width: 5in; margin: 0 auto; }
    .footer { width: 100%; text-align: center; padding-top: 14pt; border-top: 0.5pt solid #F1F5F9; }
    .footer-text { font-size: 9pt; color: #94A3B8; display: inline; }
    .footer-vylta { font-size: 12pt; font-weight: 700; color: #10B981; letter-spacing: -0.3pt; margin-left: 4pt; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="tagline">AGENDA TU CITA EN</div>
      <div class="business-name">${safeName}</div>
    </div>
    <div class="qr-section">
      <div class="qr-frame">
        <div class="qr-svg-wrap">${qrSvgString}</div>
        ${logoHtml}
      </div>
    </div>
    <div class="url-section">
      <div class="scan-instruction">Escanea con la cámara de tu celular</div>
      <div class="or-visit">o visita</div>
      <div class="url">${safeUrl}</div>
    </div>
    <div class="footer">
      <span class="footer-text">agenda con</span><span class="footer-vylta">VYLTA</span>
    </div>
  </div>
</body>
</html>`;
}

// ──────── Función principal ────────

export async function generateAndShareQrPdf(
  data: QrPdfData,
  qrSvgString: string
): Promise<QrPdfResult> {
  console.log('[generateQrPdf] Starting generation for:', data.businessName);

  try {
    if (!data.businessName?.trim()) {
      return { ok: false, error: 'Falta el nombre del negocio' };
    }
    if (!data.publicUrl?.trim()) {
      return { ok: false, error: 'Falta la URL pública' };
    }
    if (!qrSvgString?.trim()) {
      return { ok: false, error: 'No se pudo generar el código QR' };
    }

    let logoDataUri: string | null = null;
    if (data.logoUrl) {
      console.log('[generateQrPdf] Fetching logo from:', data.logoUrl);
      logoDataUri = await fetchImageAsDataUri(data.logoUrl);
      if (!logoDataUri) {
        console.warn('[generateQrPdf] Logo fetch failed, generating PDF without logo');
      }
    }

    const html = buildPdfHtml({
      businessName: data.businessName,
      publicUrl: data.publicUrl,
      qrSvgString,
      logoDataUri,
    });

    console.log('[generateQrPdf] HTML built, generating PDF...');

    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
      width: 612,
      height: 792,
    });

    console.log('[generateQrPdf] PDF generated at:', uri);

    const filename = `qr-${safeFileName(data.businessName)}.pdf`;
    const newUri = `${FileSystem.cacheDirectory}${filename}`;

    try {
      await FileSystem.moveAsync({ from: uri, to: newUri });
    } catch (err) {
      console.warn('[generateQrPdf] Rename failed, using original URI:', err);
      return await openShareSheet(uri);
    }

    return await openShareSheet(newUri);
  } catch (err: any) {
    console.error('[generateQrPdf] Unexpected error:', err);
    return {
      ok: false,
      error: err?.message || 'Error generando el PDF',
    };
  }
}

async function openShareSheet(uri: string): Promise<QrPdfResult> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    return {
      ok: false,
      error: 'Tu dispositivo no soporta compartir archivos. Por favor reporta este error.',
    };
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Descargar o imprimir QR',
    UTI: 'com.adobe.pdf',
  });

  return { ok: true, uri };
}
