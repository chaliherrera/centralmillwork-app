import { Router } from 'express'
import { webhookAuth } from '../middleware/webhookAuth'
import { validateBody } from '../middleware/validate'
import { createTaskFromEmail, emailWebhookSchema } from '../controllers/webhooksController'

// Webhooks (machine-to-machine, sin JWT).
// Cada endpoint usa webhookAuth — Bearer token contra WEBHOOK_API_TOKEN.
const router = Router()

router.post('/email', webhookAuth, validateBody(emailWebhookSchema), createTaskFromEmail)

export default router
