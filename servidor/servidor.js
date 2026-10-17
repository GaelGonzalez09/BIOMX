const express = require('express');
const sqlite3 = require('sqlite3');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

const PORT = 3000;
const ARCHIVO_TAREAS = path.join(__dirname, 'tareas.json');
const ARCHIVO_INVENTARIO = path.join(__dirname, 'inventario.json');

// Middleware y Configuración
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: false
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Conectar a la base de datos SQLite
const db = new sqlite3.Database('datos.db', (err) => {
    if (err) console.error('Error al conectar BD:', err);
    else console.log('✅ Conectado a la base de datos (Solo usuarios)');
});

// Crear tabla de usuarios
const crearTablaUsuarios = () => {
    return new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT UNIQUE,
                password TEXT,
                fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

// Helpers para manejo de JSON
const leerTareas = () => {
    try {
        return fs.existsSync(ARCHIVO_TAREAS) ? JSON.parse(fs.readFileSync(ARCHIVO_TAREAS, 'utf-8')) : [];
    } catch (e) {
        return [];
    }
};

const guardarTareas = (tareas) =>
    fs.writeFileSync(ARCHIVO_TAREAS, JSON.stringify(tareas, null, 2), 'utf-8');

const leerInventario = () => {
    try {
        return fs.existsSync(ARCHIVO_INVENTARIO) ? JSON.parse(fs.readFileSync(ARCHIVO_INVENTARIO, 'utf-8')) : [];
    } catch (e) {
        return [];
    }
};

const guardarInventario = (inv) =>
    fs.writeFileSync(ARCHIVO_INVENTARIO, JSON.stringify(inv, null, 2), 'utf-8');

// Helper para extraer la cantidad en números (ej: "20 L" -> 20)
function extraerLitros(texto) {
    if (!texto) return 0;
    const match = String(texto).match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
}

// ============ RUTAS DE USUARIOS ============

app.post('/api/registro', (req, res) => {
    const { usuario, password } = req.body;
    if (!usuario || !password) {
        return res.json({ success: false, error: 'Usuario y contraseña son requeridos' });
    }

    db.get('SELECT id FROM usuarios WHERE usuario = ?', [usuario], (err, row) => {
        if (err) return res.json({ success: false, error: err.message });
        if (row) {
            res.json({ success: true, message: 'Sesión iniciada con éxito', usuario_id: row.id });
        } else {
            db.run('INSERT INTO usuarios (usuario, password) VALUES (?, ?)', [usuario, password], function(err) {
                if (err) res.json({ success: false, error: err.message });
                else res.json({ success: true, message: 'Usuario registrado con éxito', usuario_id: this.lastID });
            });
        }
    });
});

// ============ RUTAS DE INVENTARIO ============

app.get('/api/inventario', (req, res) => {
    res.json(leerInventario());
});

app.post('/api/inventario', (req, res) => {
    const nuevoInventario = req.body || [];
    guardarInventario(nuevoInventario);
    res.json({ success: true, inventario: nuevoInventario });
});

// RUTA PARA AGREGAR RECOLECCIÓN AL INVENTARIO
app.post('/api/inventario/agregar-recoleccion', (req, res) => {
    const tarea = req.body;
    let inventario = leerInventario();
    let cantidadLitros = extraerLitros(tarea.cantidad);
    let nombreNegocio = (tarea.negocio && tarea.negocio.trim() !== '') ? tarea.negocio.trim() : (tarea.cliente || 'Recolección General');
    let fechaActual = new Date().toISOString().split('T')[0];

    let index = inventario.findIndex(item => item.negocio && item.negocio.toLowerCase() === nombreNegocio.toLowerCase());

    if (index !== -1) {
        inventario[index].litros = (parseFloat(inventario[index].litros) || 0) + cantidadLitros;
        inventario[index].fechaRecolectado = fechaActual;
        if (!inventario[index].ubicacion) inventario[index].ubicacion = tarea.lugar || tarea.direccion || '';
    } else {
        inventario.push({
            negocio: nombreNegocio,
            litros: cantidadLitros,
            fechaRecolectado: fechaActual,
            ubicacion: tarea.lugar || tarea.direccion || '',
            estado: 'Recolectado'
        });
    }

    guardarInventario(inventario);
    res.json({ success: true, inventario });
});

// ============ RUTAS DE TAREAS ============

app.get('/api/tareas', (req, res) => res.json(leerTareas()));

app.post('/api/tareas', (req, res) => {
    const tareas = leerTareas();
    const tarea = { 
        id: Date.now(), 
        fecha: new Date().toLocaleString(), 
        hecha: false, 
        ...req.body 
    };
    tareas.push(tarea);
    guardarTareas(tareas);
    res.json(tarea);
});

app.patch('/api/tareas/:id', (req, res) => {
    const tareas = leerTareas();
    const t = tareas.find(x => String(x.id) === String(req.params.id));
    if (!t) return res.status(404).json({ error: 'Tarea no encontrada' });

    t.hecha = !!req.body.hecha;
    guardarTareas(tareas);
    res.json(t);
});

app.delete('/api/tareas/:id', (req, res) => {
    guardarTareas(leerTareas().filter(x => String(x.id) !== String(req.params.id)));
    res.sendStatus(200);
});

// INICIAR SERVIDOR
crearTablaUsuarios().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
});