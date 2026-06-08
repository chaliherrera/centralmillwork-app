import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // Tests pueden tocar DB → más lentos que unit
    testTimeout: 30_000,
    hookTimeout: 30_000,

    // Cada archivo de test corre en proceso separado para aislamiento
    // de pool de Postgres (cada uno abre el suyo).
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: false },
    },

    // Setup global: cargá .env.test y verifica DB disponible antes
    setupFiles: ['./tests/setup.ts'],

    // Ubicación de tests
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],

    // Mostrar output detallado en CI/local
    reporters: ['default'],

    // No cobertura por ahora — la habilitamos cuando haya >10 tests
    coverage: {
      enabled: false,
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
