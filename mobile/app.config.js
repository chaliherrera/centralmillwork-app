// Config dinámica de Expo. Toma app.json como base y, SOLO en el build de staging,
// cambia la identidad (bundle id + nombre) para que la app "CM Staging" conviva con
// la de producción en el mismo iPhone sin reemplazarla (Opción A, decisión Chali
// 2026-09-20). El perfil de EAS setea APP_VARIANT=staging (ver eas.json).
const IS_STAGING = process.env.APP_VARIANT === 'staging'

module.exports = ({ config }) => {
  if (!IS_STAGING) return config // producción: sin cambios, misma identidad de siempre

  return {
    ...config,
    name: 'CM Staging',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.centralmillwork.app.staging',
    },
    android: {
      ...config.android,
      package: 'com.centralmillwork.app.staging',
    },
    // La app de staging es independiente: no comparte OTA updates con producción.
    updates: { ...(config.updates || {}), enabled: false },
  }
}
