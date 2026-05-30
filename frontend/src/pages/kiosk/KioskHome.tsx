import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { useKioskAuth } from '@/context/KioskAuthContext'
import ClockCard          from '@/components/kiosk/ClockCard'
import OtroTrabajo        from '@/components/kiosk/OtroTrabajo'
import PausaCard          from '@/components/kiosk/PausaCard'
import AsignacionesCard   from '@/components/kiosk/AsignacionesCard'
import AsignacionesPanel  from '@/components/kiosk/AsignacionesPanel'
// Nota: ResumenDia existe pero NO se renderiza en el kiosko — decisión de
// diseño: el resumen del día (4 buckets de tiempo + segmentos + pausas) es
// info útil para el SHOP_MANAGER, no para el operario. Mostrar al operario
// "llevás N horas hoy / tu tiempo está dividido así" agrega estrés sin
// aportar valor a su trabajo. El componente queda disponible por si se
// reutiliza en una vista del admin más adelante.

export default function KioskHome() {
  const { personal, dispositivo, logout, status } = useKioskAuth()
  const [asignacionesOpen, setAsignacionesOpen] = useState(false)

  if (!personal) return null  // ProtectedKioskRoute redirige antes

  const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-forest-700 text-white px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gold-500 flex items-center justify-center font-bold text-lg">
            {personal.iniciales}
          </div>
          <div>
            <div className="font-semibold text-lg leading-tight">{personal.nombre_completo}</div>
            <div className="text-forest-300 text-xs">
              {dispositivo && <>{dispositivo} · </>}{hora}
              {status?.proyecto_activo && (
                <> · <span className="text-gold-300">{status.proyecto_activo.proyecto_codigo}</span></>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            if (status?.registro_activo) {
              if (!confirm('Vas a salir sin hacer clock-out. ¿Seguro?')) return
            }
            logout()
          }}
          className="p-3 rounded-xl text-forest-300 hover:bg-forest-600 hover:text-white transition-colors"
          title="Salir del kiosko"
        >
          <LogOut size={20} />
        </button>
      </header>

      {/* Contenido */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <ClockCard />

        {/* Asignaciones — pieza central del kiosko después de clockin.
            Full-width, con preview de la próxima tarea para que el operario
            sepa qué hacer sin tener que abrir el panel. */}
        <AsignacionesCard onOpen={() => setAsignacionesOpen(true)} />

        {/* "Otro trabajo" — secundario, sólo aparece cuando hay sesión activa
            o cuando el operario está en un trabajo no-asignado. Si está
            haciendo un item, este componente no muestra nada. */}
        <OtroTrabajo />

        {/* Tomar break — full-width, debajo de las asignaciones.
            Antes estaba paired con Asignaciones; ahora abajo y con más espacio. */}
        <PausaCard />
      </main>

      {/* Slide-in panel de Asignaciones (renderizado fuera del flujo) */}
      <AsignacionesPanel
        open={asignacionesOpen}
        onClose={() => setAsignacionesOpen(false)}
      />
    </div>
  )
}
