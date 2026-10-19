export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface SendTaxReceiptEmailOptions {
  to: string;
  backerName: string;
  campaignName: string;
  amount: number;
  token: string;
  taxYear: number;
  pdfBytes: Uint8Array | Buffer | string;
}

export class EmailService {
  /**
   * Mock implementation of an email service.
   * In a real environment, this would use nodemailer, Resend, SendGrid, etc.
   */
  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    console.log(`[EmailService] Sending email to: ${options.to}`);
    console.log(`[EmailService] Subject: ${options.subject}`);
    console.log(`[EmailService] Body: ${options.html.substring(0, 100)}...`);
    
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    console.log(`[EmailService] Email sent successfully to ${options.to}`);
    return true;
  }

  /**
   * Sends a tax receipt email with the generated PDF attached.
   * The PDF is attached as base64-encoded content.
   */
  async sendTaxReceiptEmail(options: SendTaxReceiptEmailOptions): Promise<boolean> {
    const { to, backerName, campaignName, amount, token, taxYear, pdfBytes } = options;

    const formattedAmount = amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const subject = `Your ${taxYear} Tax Receipt for ${campaignName}`;

    const html = `
      <p>Dear ${backerName},</p>
      <p>
        Thank you for your generous contribution of ${formattedAmount} ${token} to
        <strong>${campaignName}</strong>.
      </p>
      <p>
        Please find your official tax receipt for the ${taxYear} tax year attached
        to this email. You can also download it at any time from your dashboard.
      </p>
      <p>Thank you for your support!</p>
    `;

    const attachmentBase64 = this.toBase64(pdfBytes);

    console.log(`[EmailService] Sending tax receipt email to: ${to}`);
    console.log(`[EmailService] Subject: ${subject}`);
    console.log(`[EmailService] Body: ${html.substring(0, 100)}...`);
    console.log(
      `[EmailService] Attachment: tax-receipt-${taxYear}.pdf (${attachmentBase64.length} base64 chars)`
    );

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log(`[EmailService] Tax receipt email sent successfully to ${to}`);
    return true;
  }

  private toBase64(pdfBytes: Uint8Array | Buffer | string): string {
    if (typeof pdfBytes === 'string') {
      return pdfBytes;
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(pdfBytes).toString('base64');
    }
    // Fallback for environments without Buffer
    let binary = '';
    const bytes = pdfBytes as Uint8Array;
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}