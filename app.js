const express = require('express');
const http = require('http'); // Necesario para WebSockets
const socketIo = require('socket.io'); // Importamos Socket.io
const cors = require('cors'); // Importamos CORS
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session'); 
const flash = require('connect-flash');
const path = require('path');
const router = require('./routers/router');

const app = express();
const server = http.createServer(app);
const io = socketIo(server); // Inicializamos Socket.io

const PORT = 3000;

app.use(cors({
  origin: 'https://whmjpms4-3000.use2.devtunnels.ms', // Tu URL de DevTunnels
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));


// Configurar archivos estáticos
app.use(express.static('public'));

// Configurar body-parser y cookie-parser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

app.use(flash());

app.use(session({
  secret: '*C4rd1s02025*',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }  
}));

// Middleware para compartir `io` con las rutas
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Middleware de autenticación
app.use((req, res, next) => {
  if (!req.session.usuario && req.path !== '/' && req.path !== '/validacion') {
    return res.send(`
      <script>
        alert("Debes iniciar sesión para acceder a esta página.");
        window.location.href = "/";
      </script>
    `);
  }
  next();
});

// Escuchar conexiones WebSocket
io.on('connection', (socket) => {
  console.log('⚡ Cliente conectado');
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Usar rutas
app.use('/', router);

// 🚀 Cambiamos `app.listen` por `server.listen`
server.listen(PORT, () => {
  console.log(`✅ Servidor ejecutándose en http://localhost:${PORT}`);
});
  