import express from 'express'
import {
  //   getClientToken,
  //   makePayment,
  createPayment,
  confirmPayment,
  createStripeConnectAccount,
  getStripeDashboardLink,
} from '../controller/payment.controller.js'


const router = express.Router()

// Create Payment
router.post("/create-payment", createPayment);

// Capture Payment
router.post("/confirm-payment", confirmPayment)


router.post('/connect', createStripeConnectAccount)

//  Stripe dashboard login link
router.get('/stripe-login-link/:userId', getStripeDashboardLink)


export default router
