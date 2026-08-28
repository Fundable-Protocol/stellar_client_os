export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
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
}
