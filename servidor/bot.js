const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const API = 'http://localhost:3000/api/tareas';
const client = new Client({ authStrategy: new LocalAuth() });

const MENU = `Hola, te comunicas a BIOMX somos una empresa dedicada a la recolección de aceites de origen vegetal con el propósito de tratarlo para desarrollar su aprovechamiento en otras áreas.

¿En qué te puedo ayudar?
1️⃣ Más información.
2️⃣ ¿Dónde nos encuentran?
3️⃣ Agendar recolección.`;

const INFO = `Nuestra empresa ofrece una alternativa sustentable para el aprovechamiento del aceite doméstico usado mediante su recolección en establecimientos, su transformación en biodiesel y su posterior comercialización.

La propuesta de valor consiste en convertir un residuo que contamina el medio ambiente en un producto útil promoviendo el reciclaje y el uso responsable de los recursos, además se busca establecer convenios con los establecimientos del rubro alimenticio para facilitar la disposición adecuada del aceite y de esta manera la empresa genera beneficios ambientales y económicos, impulsa la creación de empleos y contribuye al desarrollo sustentable.`;

const UBICACION = 'Estamos ubicados en la calle tal, 123, colonia común.';

const PREGUNTAS = [
  { campo: 'lugar',     texto: '¿Lugar de recolección?' },
  { campo: 'cantidad',  texto: '¿Cuánto es?' },
  { campo: 'negocio',   texto: '¿Nombre del negocio?' },
  { campo: 'direccion', texto: '¿Dirección?' },
];

// estado por contacto: { fase: 'menu' | 'confirmar' | 'preguntas', paso, datos }
const sesiones = {};

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('Bot listo ✅'));

function iniciarAgenda(s) {
  s.fase = 'preguntas';
  s.paso = 0;
  s.datos = {};
  return PREGUNTAS[0].texto;
}

client.on('message', async msg => {
  if (msg.fromMe || msg.from.endsWith('@g.us')) return; // ignora grupos
  const id = msg.from;
  const txt = msg.body.trim();
  const s = sesiones[id] || (sesiones[id] = { fase: 'menu' });

  // --- Preguntas de agenda ---
  if (s.fase === 'preguntas') {
    s.datos[PREGUNTAS[s.paso].campo] = txt;
    s.paso++;

    if (s.paso < PREGUNTAS.length) {
      return msg.reply(PREGUNTAS[s.paso].texto);
    }

    // Terminó: manda a la web
    const contacto = await msg.getContact();
    const tarea = {
      tipo: 'Recolección de aceite',
      cliente: contacto.pushname || contacto.number,
      telefono: contacto.number,
      ...s.datos,
    };
    try {
      await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tarea),
      });
    } catch (e) {
      console.error('No se pudo guardar la tarea:', e.message);
    }
    s.fase = 'menu';
    return msg.reply(
      `Muy bien, su recolección queda programada ✅\n\n` +
      `📍 Lugar: ${tarea.lugar}\n🛢️ Cantidad: ${tarea.cantidad}\n` +
      `🏪 Negocio: ${tarea.negocio}\n🏠 Dirección: ${tarea.direccion}`
    );
  }

  // --- Respuesta a "¿Desea agendar recolección?" ---
  if (s.fase === 'confirmar') {
    if (/^(s[ií]|1|3|claro|ok|va)/i.test(txt)) return msg.reply(iniciarAgenda(s));
    s.fase = 'menu';
    return msg.reply(MENU);
  }

  // --- Menú ---
  if (txt === '1') {
    s.fase = 'confirmar';
    await msg.reply(INFO);
    return msg.reply('¿Desea agendar recolección? (sí / no)');
  }
  if (txt === '2') {
    await msg.reply(UBICACION);
    return msg.reply(MENU);
  }
  if (txt === '3') return msg.reply(iniciarAgenda(s));

  return msg.reply(MENU); // cualquier otro mensaje muestra el menú
});

client.initialize();