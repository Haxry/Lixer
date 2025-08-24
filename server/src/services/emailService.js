const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    
    this.fromEmail = process.env.SMTP_USER;
  }

  async sendSwapAlert(userEmail, swapData, userAddress) {
    const { token0, token1, amount0, amount1, sender, recipient, transaction_hash, block_number, transactionHash, blockNumber } = swapData;
    
    const mailOptions = {
      from: this.fromEmail,
      to: userEmail,
      subject: `🔄 Swap Alert: Activity on ${userAddress.slice(0, 8)}...`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">🎯 Swap Detected for Your Address!</h2>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Swap Details</h3>
            <p><strong>Your Address:</strong> <code>${userAddress}</code></p>
            <p><strong>Role:</strong> ${sender.toLowerCase() === userAddress.toLowerCase() ? 'Sender' : 'Recipient'}</p>
            <p><strong>Amount In:</strong> ${Math.abs(amount0).toFixed(6)} ${token0?.symbol || 'Token0'}</p>
            <p><strong>Amount Out:</strong> ${Math.abs(amount1).toFixed(6)} ${token1?.symbol || 'Token1'}</p>
            <p><strong>Counterparty:</strong> <code>${sender.toLowerCase() === userAddress.toLowerCase() ? recipient : sender}</code></p>

            
          <div style="margin: 20px 0;">
            <a href="https://hyperevmscan.io/tx/${transactionHash || swapData.transactionHash || transaction_hash}" 
               style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              View on HyperEVM Scan
            </a>
          </div>
          
          <p style="color: #64748b; font-size: 12px;">
            You're receiving this because you subscribed to swap alerts for address ${userAddress}.
          </p>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      // Swap alert sent
    } catch (error) {
      console.error('Failed to send swap alert:', error);
      throw error;
    }
  }

  async sendSubscriptionConfirmation(userEmail, address, addressType = 'wallet') {
    const isPool = addressType === 'pool';
    const addressLabel = isPool ? 'Pool Address' : 'Wallet Address';
    const notificationText = isPool 
      ? 'whenever swaps occur in this pool'
      : 'whenever swaps involve this address';

    const mailOptions = {
      from: this.fromEmail,
      to: userEmail,
      subject: `✅ ${isPool ? 'Pool' : 'Wallet'} Swap Alerts Subscription Confirmed`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #059669;">Subscription Confirmed!</h2>
          
          <p>You've successfully subscribed to real-time swap alerts for:</p>
          <p><strong>${addressLabel}:</strong></p>
          <p><code style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">${address}</code></p>
          
          <p>You'll receive instant email notifications ${notificationText}.</p>
          
          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <strong>⚡ ${isPool ? 'Pool' : 'Wallet'} monitoring enabled!</strong><br>
          </div>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      // Confirmation sent
    } catch (error) {
      console.error('Failed to send confirmation:', error);
      throw error;
    }
  }
}

module.exports = EmailService;
