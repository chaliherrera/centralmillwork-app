# Instrucciones permanentes para Claude Code en este repo

## Sobre el usuario
- Chali (Pedro Herrera) es admin, no programador. Explica con claridad. Nunca asumas conocimiento técnico.
- Las decisiones de producto se discuten antes de codear. Las decisiones técnicas se proponen, no se imponen.

## Sobre el flujo de trabajo con git
- Hacer commits locales frecuentes (cada sub-feature funcional) sin push. Esto es red de seguridad: si algo se rompe, el progreso está salvado en git.
- Antes de mostrar una prueba en localhost, asegurarse de haber commiteado los cambios localmente.
- Nunca hacer push automático. El push siempre requiere confirmación explícita en el chat.
- Para features grandes: trabajar en rama nueva (feat/nombre-corto), commits parciales en esa rama, y al final mergear a main con aprobación.

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
