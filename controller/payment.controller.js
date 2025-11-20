import { Order } from '../model/order.model.js'
import { paymentInfo } from '../model/payment.model.js'
import { User } from '../model/user.model.js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2022-11-15',
})

export const createPayment = async (req, res) => {
  const { userId, price, orderId, type } = req.body

  if (!price || !type) {
    return res.status(400).json({
      error: 'amount is required.',
    })
  }

  try {
    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(price * 100), // Stripe expects the amount in cents
      currency: 'usd',
      metadata: {
        userId,
        orderId,
        type,
      },
    })

    // Save payment record with status 'pending'
    const PaymentInfo = new paymentInfo({
      userId,
      orderId,
      price,
      transactionId: paymentIntent.id,
      paymentStatus: 'pending',
      type,
    })
    await PaymentInfo.save()

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      message: 'PaymentIntent created.',
    })
  } catch (error) {
    console.error('Error creating PaymentIntent:', error)
    res.status(500).json({
      error: 'Internal server error.',
    })
  }
}

// export const confirmPayment = async (req, res) => {
//   const { paymentIntentId } = req.body

//   if (!paymentIntentId) {
//     return res.status(400).json({ error: 'paymentIntentId is required.' })
//   }

//   try {
//     const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

//     if (paymentIntent.status !== 'succeeded') {
//       await paymentInfo.findOneAndUpdate(
//         { transactionId: paymentIntentId },
//         { paymentStatus: 'failed' }
//       )

//       return res.status(400).json({ error: 'Payment was not successful.' })
//     }

//     const paymentRecord = await paymentInfo.findOneAndUpdate(
//       { transactionId: paymentIntentId },
//       { paymentStatus: 'complete' },
//       { new: true }
//     )

//     if (paymentRecord?.orderId) {
//       const order = await Order.findByIdAndUpdate(paymentRecord.orderId, {
//         paymentStatus: 'paid',
//       }).populate('farm', 'seller')

//       // Get seller account ID
//       const sellerUser = await User.findById(order.farm.seller) // You must pass sellerId to paymentInfo when creating it
//       const sellerStripeAccountId = sellerUser?.stripeAccountId

//       if (!sellerStripeAccountId) {
//         return res
//           .status(400)
//           .json({ error: 'Seller Stripe account not connected.' })
//       }

//       const adminShare = Math.round(paymentRecord.price * 0.049 * 100) // 5%
//       const sellerShare = Math.round(paymentRecord.price * 0.951 * 100) // 95%

//       // Transfer 95% to the seller
//       const transfer = await stripe.transfers.create({
//         amount: sellerShare,
//         currency: 'usd',
//         destination: sellerStripeAccountId,
//         transfer_group: `ORDER_${paymentIntent.id}`,
//       })
//       console.log('first', paymentInfo.id)

//       if (!transfer) {
//         return res.status(400).json({ error: 'Transfer failed.' })
//       }
//     }

//     return res.status(200).json({
//       success: true,
//       message: 'Payment processed and transferred.',
//       paymentIntent,
//     })
//   } catch (error) {
//     console.error('Error confirming or transferring payment:', error)
//     res.status(500).json({ error: 'Internal server error.' })
//   }
// }



export const confirmPayment = async (req, res) => {
  const { paymentIntentId } = req.body

  if (!paymentIntentId) {
    return res.status(400).json({ error: 'Missing paymentIntentId in request body.' })
  }

  try {
    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (!paymentIntent) {
      return res.status(404).json({ error: 'PaymentIntent not found.' })
    }

    if (paymentIntent.status !== 'succeeded') {
      await paymentInfo.findOneAndUpdate(
        { transactionId: paymentIntentId },
        { paymentStatus: 'failed' }
      )

      return res.status(400).json({ error: 'Payment did not succeed.' })
    }

    // Update payment record
    const paymentRecord = await paymentInfo.findOneAndUpdate(
      { transactionId: paymentIntentId },
      { paymentStatus: 'complete' },
      { new: true }
    )

    if (!paymentRecord) {
      return res.status(404).json({ error: 'Payment record not found in database.' })
    }

    // Handle order-related updates and transfers
    if (paymentRecord.orderId) {
      const order = await Order.findByIdAndUpdate(
        paymentRecord.orderId,
        { paymentStatus: 'paid' },
        { new: true }
      ).populate('farm', 'seller')

      if (!order || !order.farm || !order.farm.seller) {
        return res.status(404).json({ error: 'Associated order or seller not found.' })
      }

      const sellerUser = await User.findById(order.farm.seller)

      if (!sellerUser?.stripeAccountId) {
        return res.status(400).json({ error: 'Seller has not connected their Stripe account.' })
      }

      const amountInCents = Math.round(paymentRecord.price * 100)
      const adminShare = Math.round(amountInCents * 0.049) // 4.9%
      const sellerShare = amountInCents - adminShare

      try {
        const transfer = await stripe.transfers.create({
          amount: sellerShare,
          currency: 'usd',
          destination: sellerUser.stripeAccountId,
          transfer_group: `ORDER_${paymentIntentId}`,
        })
        console.log(transfer)

        if (!transfer ) {
          return res.status(500).json({ error: 'Transfer to seller failed.' })
        }
      } catch (transferError) {
        console.error('Stripe transfer error:', transferError)
        return res.status(500).json({ error: 'Error while transferring funds to seller.' })
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Payment confirmed and processed successfully.',
      paymentIntentId,
    })
  } catch (err) {
    console.error('Payment confirmation error:', err)

    let errorMessage = 'Internal server error.'
    if (err.type === 'StripeInvalidRequestError') {
      errorMessage = err.message || 'Invalid Stripe request.'
    }

    return res.status(500).json({
      error: errorMessage,
      stripeError: err?.raw?.message || null,
    })
  }
}


export const createStripeConnectAccount = async (req, res) => {
  try {
    const { userId } = req.body

    const user = await User.findById(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    // Step 1: Create account if not already exists
    let accountId = user.stripeAccountId
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
      })

      user.stripeAccountId = account.id
      await user.save()

      accountId = account.id
    }

    // Step 2: Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.CLIENT_URL}/connect/refresh`,
      return_url: `${process.env.CLIENT_URL}/stripe-account-success`,
      type: 'account_onboarding',
    })

    res.status(200).json({ url: accountLink.url })
  } catch (error) {
    console.error('Stripe onboarding error:', error)
    res.status(500).json({ error: 'Internal Server Error' })
  }
}

export const getStripeDashboardLink = async (req, res) => {
  try {
    const { userId } = req.params

    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    if (!user.stripeAccountId) {
      return res.status(400).json({
        success: false,
        message: 'User does not have a connected Stripe account',
      })
    }

    const loginLink = await stripe.accounts.createLoginLink(
      user.stripeAccountId
    )

    return res.status(200).json({
      success: true,
      url: loginLink.url,
    })
  } catch (error) {
    console.error('Error generating login link:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    })
  }
}
