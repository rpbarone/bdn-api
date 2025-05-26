import * as postmark from 'postmark';
import * as path from 'path';
import * as fs from 'fs';

interface EmailTemplate {
  subject: string;
  preheader?: string;
  greeting: string;
  mainContentHtml: string;
  callToAction?: {
    text: string;
    url: string;
  };
  appName?: string;
  primaryColor?: string;
  contrastPrimaryColor?: string;
  darkAccentColor?: string;
  footerAddress?: string;
  logoCid?: string;
}

class PostmarkService {
  private client: postmark.ServerClient | null;
  private fromEmail: string;
  private appName: string;
  private baseUrl: string;
  private defaultPrimaryColor: string = '#4F46E5';
  private defaultContrastColor: string = '#FFFFFF';
  private defaultDarkAccentColor: string = '#3730A3';

  constructor() {
    const apiKey = process.env.POSTMARK_API_KEY || '';
    if (!apiKey) {
      console.warn('⚠️ POSTMARK_API_KEY não configurada. Emails não serão enviados.');
      this.client = null;
    } else {
      this.client = new postmark.ServerClient(apiKey);
    }
    
    this.fromEmail = process.env.POSTMARK_FROM_EMAIL || 'noreply@app.com';
    this.appName = process.env.APP_NAME || 'BDN';
    this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  }

  /**
   * Gera HTML do template de email
   */
  private generateEmailHtml(template: EmailTemplate): string {
    const {
      preheader,
      greeting,
      mainContentHtml,
      callToAction,
      appName = this.appName,
      primaryColor = this.defaultPrimaryColor,
      contrastPrimaryColor = this.defaultContrastColor,
      darkAccentColor = this.defaultDarkAccentColor,
      footerAddress,
      logoCid
    } = template;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${template.subject}</title>
    <style>
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        body { margin: 0; padding: 0; width: 100% !important; }
        .wrapper { width: 100%; table-layout: fixed; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        .webkit { max-width: 600px; margin: 0 auto; }
        .outer { Margin: 0 auto; width: 100%; max-width: 600px; }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4;">
    <center class="wrapper" style="width: 100%; table-layout: fixed; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; background-color: #f4f4f4;">
        ${preheader ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</div>` : ''}
        <div class="webkit" style="max-width: 600px; margin: 0 auto;">
            <!--[if (gte mso 9)|(IE)]>
            <table width="600" align="center" style="border-spacing:0;font-family:sans-serif;color:#333333;">
            <tr>
            <td style="padding:0;">
            <![endif]-->
            <table class="outer" align="center" style="Margin:0 auto;width:100%;max-width:600px;border-spacing:0;font-family:Arial,sans-serif;color:#333333;background-color:#ffffff;">
                <!-- HEADER / LOGO -->
                <tr>
                    <td style="padding:20px;text-align:center;background-color:${primaryColor};">
                        ${logoCid ? `<img src="cid:${logoCid}" alt="${appName} Logo" style="max-width:180px;height:auto;border:0;">` : `<h1 style="margin:0;font-size:28px;color:${contrastPrimaryColor};">${appName}</h1>`}
                    </td>
                </tr>

                <!-- MAIN CONTENT -->
                <tr>
                    <td style="padding:30px 20px;">
                        <p style="margin:0 0 15px;font-size:18px;line-height:1.5;color:#333333;">
                            ${greeting}
                        </p>
                        <div style="font-size:16px;line-height:1.6;color:#555555;">
                            ${mainContentHtml}
                        </div>
                        ${callToAction && callToAction.url && callToAction.text ? `
                        <table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="Margin:30px auto 0;">
                            <tr>
                                <td align="center" bgcolor="${primaryColor}" role="presentation" style="border-radius:4px;background-color:${primaryColor};cursor:auto;">
                                    <a href="${callToAction.url}" target="_blank" style="background:${primaryColor};border:1px solid ${primaryColor};border-radius:4px;color:${contrastPrimaryColor};display:inline-block;font-family:sans-serif;font-size:16px;font-weight:bold;line-height:45px;text-align:center;text-decoration:none;width:auto;padding:0 25px;-webkit-text-size-adjust:none;mso-hide:all;">
                                        ${callToAction.text}
                                    </a>
                                </td>
                            </tr>
                        </table>
                        ` : ''}
                    </td>
                </tr>

                <!-- FOOTER -->
                <tr>
                    <td style="padding:20px;text-align:center;background-color:#eeeeee;border-top:1px solid #dddddd;">
                        <p style="margin:0 0 10px;font-size:12px;color:#777777;">
                            © ${new Date().getFullYear()} ${appName}. Todos os direitos reservados.
                        </p>
                        ${footerAddress ? `<p style="margin:0;font-size:12px;color:#777777;">${footerAddress}</p>` : ''}
                    </td>
                </tr>
            </table>
            <!--[if (gte mso 9)|(IE)]>
            </td>
            </tr>
            </table>
            <![endif]-->
        </div>
    </center>
</body>
</html>`;
  }

  /**
   * Envia email usando template personalizado
   */
  async sendEmail(
    to: string,
    template: EmailTemplate,
    attachments?: postmark.Attachment[]
  ): Promise<boolean> {
    try {
      if (!this.client) {
        console.log(`📧 [DEV] Email para ${to}: ${template.subject}`);
        return true;
      }

      const htmlBody = this.generateEmailHtml(template);

      const message: postmark.Message = {
        From: this.fromEmail,
        To: to,
        Subject: template.subject,
        HtmlBody: htmlBody,
        TextBody: this.generateTextFromHtml(template),
        MessageStream: 'outbound',
        Attachments: attachments
      };

      await this.client.sendEmail(message);
      console.log(`✅ Email enviado para ${to}: ${template.subject}`);
      return true;
    } catch (error: any) {
      console.error(`❌ Erro ao enviar email para ${to}:`, error.message);
      return false;
    }
  }

  /**
   * Gera versão texto do email
   */
  private generateTextFromHtml(template: EmailTemplate): string {
    let text = `${template.greeting}\n\n`;
    
    // Remove tags HTML básicas
    text += template.mainContentHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
    
    if (template.callToAction) {
      text += `\n\n${template.callToAction.text}: ${template.callToAction.url}`;
    }
    
    text += `\n\n© ${new Date().getFullYear()} ${this.appName}. Todos os direitos reservados.`;
    
    return text;
  }

  /**
   * Envia email de boas-vindas
   */
  async sendWelcomeEmail(to: string, userName: string): Promise<boolean> {
    const template: EmailTemplate = {
      subject: `Bem-vindo ao ${this.appName}!`,
      preheader: 'Sua conta foi criada com sucesso',
      greeting: `Olá ${userName}!`,
      mainContentHtml: `
        <p>Seja muito bem-vindo ao <strong>${this.appName}</strong>!</p>
        <p>Sua conta foi criada com sucesso e você já pode começar a aproveitar todas as funcionalidades da nossa plataforma.</p>
        <p>Aqui estão algumas dicas para começar:</p>
        <ul style="margin: 15px 0; padding-left: 20px;">
          <li style="margin-bottom: 8px;">Complete seu perfil para ter acesso a todos os recursos</li>
          <li style="margin-bottom: 8px;">Configure suas preferências de notificação</li>
          <li style="margin-bottom: 8px;">Explore nossa documentação e tutoriais</li>
        </ul>
        <p>Se tiver qualquer dúvida, nossa equipe de suporte está sempre disponível para ajudar.</p>
      `,
      callToAction: {
        text: 'Acessar Minha Conta',
        url: `${this.baseUrl}/dashboard`
      }
    };

    return this.sendEmail(to, template);
  }

  /**
   * Envia email de redefinição de senha
   */
  async sendPasswordResetEmail(to: string, userName: string, resetToken: string): Promise<boolean> {
    const resetUrl = `${this.baseUrl}/reset-password?token=${resetToken}`;
    
    const template: EmailTemplate = {
      subject: 'Redefinição de Senha',
      preheader: 'Solicitação de redefinição de senha',
      greeting: `Olá ${userName}!`,
      mainContentHtml: `
        <p>Recebemos uma solicitação para redefinir a senha da sua conta no <strong>${this.appName}</strong>.</p>
        <p>Se você não fez essa solicitação, pode ignorar este email com segurança. Sua senha não será alterada.</p>
        <p>Para redefinir sua senha, clique no botão abaixo:</p>
        <p style="margin-top: 20px; font-size: 14px; color: #666;">
          <strong>Este link expira em 30 minutos por questões de segurança.</strong>
        </p>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">
          Se o botão não funcionar, copie e cole este link no seu navegador:<br>
          <span style="word-break: break-all;">${resetUrl}</span>
        </p>
      `,
      callToAction: {
        text: 'Redefinir Minha Senha',
        url: resetUrl
      }
    };

    return this.sendEmail(to, template);
  }

  /**
   * Envia email de confirmação de redefinição de senha
   */
  async sendPasswordChangedEmail(to: string, userName: string): Promise<boolean> {
    const template: EmailTemplate = {
      subject: 'Senha Alterada com Sucesso',
      preheader: 'Sua senha foi redefinida',
      greeting: `Olá ${userName}!`,
      mainContentHtml: `
        <p>Sua senha foi alterada com sucesso.</p>
        <p>Se você não realizou esta alteração, entre em contato com nosso suporte imediatamente.</p>
        <p style="margin-top: 20px;">
          <strong>Dicas de segurança:</strong>
        </p>
        <ul style="margin: 15px 0; padding-left: 20px;">
          <li style="margin-bottom: 8px;">Use uma senha forte e única</li>
          <li style="margin-bottom: 8px;">Não compartilhe sua senha com ninguém</li>
          <li style="margin-bottom: 8px;">Ative a autenticação de dois fatores para maior segurança</li>
        </ul>
      `,
      callToAction: {
        text: 'Acessar Minha Conta',
        url: `${this.baseUrl}/login`
      }
    };

    return this.sendEmail(to, template);
  }

  /**
   * Envia email com código 2FA
   */
  async send2FASetupEmail(to: string, userName: string, qrCodeDataUrl: string, backupCodes: string[]): Promise<boolean> {
    const template: EmailTemplate = {
      subject: 'Configuração de Autenticação de Dois Fatores',
      preheader: 'Configure o Google Authenticator',
      greeting: `Olá ${userName}!`,
      mainContentHtml: `
        <p>Você solicitou a ativação da autenticação de dois fatores em sua conta.</p>
        <p><strong>Instruções de configuração:</strong></p>
        <ol style="margin: 15px 0; padding-left: 20px;">
          <li style="margin-bottom: 12px;">
            Baixe o Google Authenticator em seu dispositivo móvel:
            <ul style="margin-top: 8px;">
              <li><a href="https://apps.apple.com/app/google-authenticator/id388497605" style="color: ${this.defaultPrimaryColor};">iOS (App Store)</a></li>
              <li><a href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" style="color: ${this.defaultPrimaryColor};">Android (Google Play)</a></li>
            </ul>
          </li>
          <li style="margin-bottom: 12px;">Abra o aplicativo e escaneie o código QR anexo a este email</li>
          <li style="margin-bottom: 12px;">Digite o código de 6 dígitos gerado no aplicativo para confirmar a configuração</li>
        </ol>
        
        <div style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 4px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #92400E;">
            <strong>⚠️ IMPORTANTE - Códigos de Backup:</strong><br>
            Guarde estes códigos em um local seguro. Você pode usá-los para acessar sua conta caso perca o acesso ao seu dispositivo:
          </p>
          <div style="font-family: monospace; background-color: #FFFBEB; padding: 10px; margin-top: 10px; border-radius: 4px;">
            ${backupCodes.join('<br>')}
          </div>
        </div>
        
        <p style="margin-top: 20px; font-size: 14px; color: #666;">
          Cada código de backup só pode ser usado uma vez. Após usar todos, você precisará gerar novos códigos.
        </p>
      `
    };

    // Converte o data URL do QR code para attachment
    const qrCodeBase64 = qrCodeDataUrl.split(',')[1];
    const attachments: postmark.Attachment[] = [{
      Name: 'qrcode-2fa.png',
      Content: qrCodeBase64,
      ContentType: 'image/png',
      ContentID: 'qrcode'
    }];

    return this.sendEmail(to, template, attachments);
  }

  /**
   * Envia email genérico
   */
  async sendGenericEmail(
    to: string,
    subject: string,
    content: string,
    callToAction?: { text: string; url: string }
  ): Promise<boolean> {
    const template: EmailTemplate = {
      subject,
      greeting: 'Olá!',
      mainContentHtml: content,
      callToAction
    };

    return this.sendEmail(to, template);
  }
}

// Exporta instância única (singleton)
export default new PostmarkService();
