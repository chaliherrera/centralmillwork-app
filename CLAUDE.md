# Instrucciones permanentes para Claude Code en este repo

## Sobre el usuario
- Chali (Pedro Herrera) es admin, no programador. Explica con claridad. Nunca asumas conocimiento técnico.
- Las decisiones de producto se discuten antes de codear. Las decisiones técnicas se proponen, no se imponen.

## Sobre el flujo de trabajo con git
- Hacer commits locales frecuentes (cada sub-feature funcional) sin push. Esto es red de seguridad: si algo se rompe, el progreso está salvado en git.
- Antes de mostrar una prueba en localhost, asegurarse de haber commiteado los cambios localmente.
- Nunca hacer push automático. El push siempre requiere confirmación explícita en el chat.
- Para features grandes: trabajar en rama nueva (feat/nombre-corto), commits parciales en esa rama, y al final mergear a main con aprobación.

## Sobre contexto y memoria (para NO perder trabajo entre ramas)
- Antes de que Chali pruebe un área o feature, CRUZAR la memoria con el estado REAL de la rama de trabajo: verificar que los archivos y migraciones de ese feature estén EN esta rama. No alcanza con que esté "documentado" o hecho en otra rama — hay que confirmar que la rama actual lo tenga, y AVISAR antes de que Chali lo pruebe si falta.
- Leer la carpeta de memoria (grep) antes de preguntar o afirmar sobre proceso/roles/fechas/arquitectura/estado de un feature. No re-preguntar lo documentado.
- Mapa de ramas (crítico):
  - `feat/cronograma-pm` = rama activa del Scheduler / cronograma / proceso simplificado del alta de proyecto.
  - El PORTAL del cliente (inglés + T&C + layout, migr.091+101) YA FUE PORTADO a `feat/cronograma-pm` (2026-11-27, commit c8ba610) y verificado en staging. Falta un follow-up chico: la Consola de admin del portal + el link enmascarado en la bandeja de Estimados. Ver memoria `project_portal_no_en_cronograma_pm`.

## Sobre archivos sensibles que NO deben commitearse
- database/seed_*_test.sql y seed_*_demo.sql son datos de prueba locales únicamente
- Cualquier archivo .env* siempre ignorado

## Sobre el stack
- Backend: Node/Express/TypeScript + Postgres. Está en backend/.
- Frontend web: React + Vite + TypeScript. Está en frontend/. Dev server en localhost:3000.
- Móvil: Expo / React Native. Está en mobile/.
- Producción: Railway (auto-deploy desde main).

## Sobre lo que ya está hecho
Ver CHANGELOG.md para historial de features lanzados.
