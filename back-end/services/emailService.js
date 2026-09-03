const nodemailer = require('nodemailer');
const os = require('os');

let transporter = null;


async function getTransporter() {
  if (transporter) return transporter;

  const emailUser = process.env.EMAIL_USER || 'mareygashaw21@gmail.com';
  const emailPass = process.env.EMAIL_PASS || 'dcdcwjqkkxinvdal';
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.OAUTH_REFRESH_TOKEN;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT || 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (emailUser && emailPass) {
    console.log(`[Email Service] Initializing live Gmail SSL transporter for ${emailUser}`);
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // SSL
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });
  } else if (emailUser && clientId && clientSecret && refreshToken) {
    console.log(`[Email Service] Initializing Google OAuth2 transporter for ${emailUser}`);
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: emailUser,
        clientId: clientId,
        clientSecret: clientSecret,
        refreshToken: refreshToken
      }
    });
  } else if (smtpHost && smtpUser && smtpPass) {
    console.log(`[Email Service] Initializing live SMTP transporter for ${smtpHost}:${smtpPort}`);
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort),
      secure: Number(smtpPort) === 465,
      auth: { user: smtpUser, pass: smtpPass }
    });
  } else {
    console.log('[Email Service] Operating in fast local/console output mode (No external network delay).');
    transporter = nodemailer.createTransport({
      jsonTransport: true
    });
  }

  return transporter;
}

const DEFAULT_FROM = process.env.SMTP_FROM || (process.env.EMAIL_USER ? `"Resource Scheduler" <${process.env.EMAIL_USER}>` : '"Resource Scheduler" <mareygashaw21@gmail.com>');

/**
 * Generic email dispatcher with guaranteed immediate console & API output
 */
async function sendEmail({ to, subject, html, text }) {
  try {
    if (!to) {
      console.warn('[Email Service Warning] No recipient email specified.');
      return { success: false, error: 'Recipient email missing' };
    }

    const transport = await getTransporter();
    const mailOptions = {
      from: DEFAULT_FROM,
      to,
      subject,
      text: text || html.replace(/<[^>]+>/g, ''),
      html
    };

    const info = await transport.sendMail(mailOptions);

    console.log(`\n=======================================================`);
    console.log(`📧 [EMAIL SENT SUCCESSFULLY]`);
    console.log(`📩 To: ${to}`);
    console.log(`📌 Subject: ${subject}`);
    console.log(`📄 HTML Content:\n${html}`);
    console.log(`=======================================================\n`);

    return {
      success: true,
      messageId: info.messageId || `msg-${Date.now()}`,
      to,
      subject,
      summary: `Email sent to ${to} with subject "${subject}"`
    };
  } catch (err) {
    console.error('[Email Service Error] Failed to send email:', err.message);
    return { success: false, error: err.message };
  }
}


/**
 * 1. Booking Confirmation Email
 */
async function sendBookingConfirmation(userEmail, booking) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #2563eb;">🎉 Booking Confirmation</h2>
      <p>Hello <strong>${booking.user_name || 'Valued User'}</strong>,</p>
      <p>Your booking request has been successfully <strong>confirmed</strong>!</p>
      <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Booking Ref:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.bookingRef || booking.booking_ref}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Title:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.title}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Resource:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.resource_name}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Start:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.start_datetime}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>End:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.end_datetime}</td></tr>
      </table>
      <p style="color: #64748b; font-size: 13px;">Please remember to check-in within 15 minutes of your booking start time to avoid auto-cancellation.</p>
    </div>
  `;
  return sendEmail({
    to: userEmail,
    subject: `Booking Confirmed: ${booking.title} (${booking.bookingRef || booking.booking_ref})`,
    html
  });
}

/**
 * 2. Approval Request Email (To Manager/Dept Head)
 */
async function sendApprovalRequest(approverEmail, booking) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #d97706;">⏳ Booking Pending Your Approval</h2>
      <p>Hello Manager,</p>
      <p>A new booking request requires your approval:</p>
      <ul>
        <li><strong>Requester:</strong> ${booking.user_name} (${booking.user_email})</li>
        <li><strong>Resource:</strong> ${booking.resource_name}</li>
        <li><strong>Title:</strong> ${booking.title}</li>
        <li><strong>Time:</strong> ${booking.start_datetime} to ${booking.end_datetime}</li>
      </ul>
      <p>Please log in to the Resource Scheduler to Approve or Reject this request.</p>
    </div>
  `;
  return sendEmail({
    to: approverEmail,
    subject: `Approval Required: Booking #${booking.bookingRef || booking.booking_ref}`,
    html
  });
}

/**
 * 3. Approval Status Update Email (Approved / Rejected)
 */
async function sendApprovalStatusUpdate(userEmail, booking, action, reason) {
  const isApproved = action === 'approved';
  const color = isApproved ? '#16a34a' : '#dc2626';
  const statusTitle = isApproved ? 'Approved ✅' : 'Rejected ❌';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: ${color};">Booking Request ${statusTitle}</h2>
      <p>Your booking for <strong>${booking.resource_name || 'Resource'}</strong> has been <strong>${action}</strong>.</p>
      <p><strong>Title:</strong> ${booking.title}</p>
      <p><strong>Booking Ref:</strong> ${booking.booking_ref || booking.bookingRef}</p>
      ${reason ? `<p style="background: #fef2f2; padding: 10px; border-left: 4px solid #dc2626;"><strong>Reason / Notes:</strong> ${reason}</p>` : ''}
    </div>
  `;
  return sendEmail({
    to: userEmail,
    subject: `Booking ${statusTitle}: ${booking.title}`,
    html
  });
}

/**
 * 4. Booking Cancellation Email
 */
async function sendBookingCancellation(userEmail, booking, reason) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #dc2626;">🚫 Booking Cancelled</h2>
      <p>The booking for <strong>"${booking.title}"</strong> (${booking.booking_ref}) has been cancelled.</p>
      <p><strong>Resource:</strong> ${booking.resource_name || 'Resource'}</p>
      <p><strong>Original Time:</strong> ${booking.start_datetime}</p>
      ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
    </div>
  `;
  return sendEmail({
    to: userEmail,
    subject: `Cancelled: ${booking.title}`,
    html
  });
}

/**
 * 5. No-Show Cancellation Email
 */
async function sendNoShowCancellation(userEmail, booking, noShowCount) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #b91c1c;">⚠️ Booking Auto-Cancelled (No-Show)</h2>
      <p>Hello ${booking.user_name || 'User'},</p>
      <p>Your booking <strong>"${booking.title}"</strong> was automatically cancelled because check-in was not completed within the 15-minute grace period.</p>
      <p><strong>Accumulated No-Show Count:</strong> ${noShowCount}/3</p>
      ${noShowCount >= 3 ? `<p style="color: #dc2626; font-weight: bold;">Notice: You have reached 3 no-shows. Booking privileges are suspended for 7 days.</p>` : ''}
    </div>
  `;
  return sendEmail({
    to: userEmail,
    subject: `No-Show Notice: ${booking.title} Auto-Cancelled`,
    html
  });
}

/**
 * 6. Waitlist Offer Email
 */
async function sendWaitlistOffer(userEmail, waitlistInfo) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #2563eb;">✨ Waitlist Slot Available!</h2>
      <p>Good news! A slot has freed up for your waitlisted resource.</p>
      <p>You have 24 hours to confirm and accept this booking slot.</p>
    </div>
  `;
  return sendEmail({
    to: userEmail,
    subject: `Waitlist Slot Available!`,
    html
  });
}

function getFrontendUrl(clientOrigin) {
  // If client request provided a valid non-localhost origin (e.g. network IP or domain tunnel), use it directly
  if (clientOrigin && typeof clientOrigin === 'string') {
    try {
      const url = new URL(clientOrigin);
      if (url.hostname && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        return clientOrigin.replace(/\/$/, '');
      }
    } catch (e) {
      // ignore parsing error
    }
  }

  // Otherwise detect active LAN / Wi-Fi IP address so links work on both PC and mobile devices
  try {
    const nets = os.networkInterfaces();
    // Prioritize Wi-Fi or Ethernet interfaces first
    const preferredNames = Object.keys(nets).sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const aIsWifiOrEth = aLower.includes('wi-fi') || aLower.includes('wifi') || aLower.includes('ethernet') || aLower.includes('wlan');
      const bIsWifiOrEth = bLower.includes('wi-fi') || bLower.includes('wifi') || bLower.includes('ethernet') || bLower.includes('wlan');
      if (aIsWifiOrEth && !bIsWifiOrEth) return -1;
      if (!aIsWifiOrEth && bIsWifiOrEth) return 1;
      return 0;
    });

    for (const name of preferredNames) {
      const netList = nets[name] || [];
      for (const net of netList) {
        if (net.family === 'IPv4' && !net.internal && net.address !== '127.0.0.1') {
          return `http://${net.address}:5173`;
        }
      }
    }
  } catch (e) {
    // fallback
  }
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

/**
 * 7. Password Reset Email
 */
async function sendPasswordResetEmail(userEmail, resetToken, userName, clientOrigin = null) {
  const frontendUrl = getFrontendUrl(clientOrigin);
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
  
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #f1f5f9;">
        <h2 style="color: #4f46e5; margin: 0; font-size: 22px;">🔐 Password Reset Request</h2>
        <p style="color: #64748b; font-size: 13px; margin: 6px 0 0 0;">Shared Resource Scheduling Platform</p>
      </div>
      
      <p style="font-size: 15px; color: #334155;">Hello <strong>${userName || 'Valued User'}</strong>,</p>
      
      <p style="font-size: 14px; color: #475569; line-height: 1.6;">
        We received a request to reset your password. Please click the secure button below to set a new password for your account:
      </p>
      
      <div style="text-align: center; margin: 28px 0;">
        <a href="${resetLink}" target="_blank" style="background: linear-gradient(135deg, #4f46e5, #6366f1); color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">
          Reset My Password
        </a>
      </div>
      
      <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
        If the button above does not work, copy and paste this link into your browser:
      </p>
      <div style="background-color: #f8fafc; padding: 10px 14px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 20px; word-break: break-all;">
        <a href="${resetLink}" style="color: #4f46e5; font-size: 13px; text-decoration: none;">${resetLink}</a>
      </div>
      
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      
      <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.5;">
        ⏱️ This password reset link will expire in <strong>5 minutes</strong>.<br />
        🛡️ If you did not request this change, you can safely ignore this email. Your account remains secure.
      </p>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject: `Password Reset Request - Resource Scheduler`,
    html
  });
}

module.exports = {
  sendEmail,
  sendBookingConfirmation,
  sendApprovalRequest,
  sendApprovalStatusUpdate,
  sendBookingCancellation,
  sendNoShowCancellation,
  sendWaitlistOffer,
  sendPasswordResetEmail
};
