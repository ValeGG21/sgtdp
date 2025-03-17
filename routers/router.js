const express = require('express');
const socketIo = require('socket.io'); // Importamos Socket.io
const router = express.Router();
const bcrypt = require('bcrypt');
const sql = require('../config/db');
const path = require('path');
const multer = require('multer');

// Middleware de autenticación
function requireLogin(req, res, next) {
  if (!req.session.usuario) {
    return res.redirect('/');  // Redirige al login si no hay sesión activa
  }
  next();  // Si la sesión está activa, continúa con la siguiente función
}

// Ruta para mostrar index.ejs (login)
router.get('/', (req, res) => {
  res.render('index');
});

// Ruta para manejar la validación del inicio de sesión
router.post('/validacion', (req, res) => {
  const { estacion, usuario, contraseña } = req.body;

  const query = `SELECT * FROM usuario WHERE usuario = ? AND estacion = ?`;
  sql.query(query, [usuario, estacion], async (err, results) => {
    if (err) {
      console.error('Error al consultar la base de datos:', err);
      return res.status(500).send('Error interno del servidor.');
    }

    if (results.length === 0) {
      return res.status(401).send('<script>alert("Credenciales incorrectas."); window.location.href = "/";</script>');
    }

    const user = results[0];

    try {
      const passwordMatch = await bcrypt.compare(contraseña, user.contraseña);
      if (!passwordMatch) {
        return res.status(401).send('<script>alert("Contraseña incorrecta."); window.location.href = "/";</script>');
      }

      // Depuración: Comprobar si `req.session` está definido
      console.log('Sesión antes de asignar:', req.session);

      // Guardar datos del usuario en la sesión
      req.session.usuario = { id: user.id, nombre: user.nombre, rol: user.rol };

      // Depuración: Comprobar si los datos se asignaron correctamente
      console.log('Sesión después de asignar:', req.session);

      // Redireccionar según el número de estación
      if (estacion === '01') {
        res.redirect('/produccion');
        } else if (estacion === '02') {
          res.redirect('/coccionenfri');
        } else if(estacion === '03') {
          res.redirect('/cavas');
        }else if(estacion === '04') {
          res.redirect('/empaque');
        } else if (estacion === '05') {
        res.redirect('/home');
        } else {
        res.redirect('/');
      }
    } catch (error) {
      console.error('Error al comparar contraseñas:', error);
      return res.status(500).send('Error interno del servidor.');
    }
  });
});
// 🏠 Ruta para la página principal (home.ejs)
router.get('/home', requireLogin, (req, res) => {
  const query = `
  SELECT 
    producto_elaborado AS producto,
    DATE_FORMAT(fecha, '%d/%m/%Y') AS fecha,
    lote,
    DATE_FORMAT(vence, '%d/%m/%Y') AS vence,
    estado_carne AS estado,
    procedencia
  FROM new_temperaturas_produccion
  WHERE activo = 1
  ORDER BY fecha DESC
`;


  sql.query(query, (err, resultados) => {
    if (err) {
      console.error('Error al obtener procesos:', err);
      return res.render('home', { 
        user: req.session.usuario, 
        procesos: [], 
        error: 'Error al cargar los procesos' 
      });
    }
    res.render('home', { 
      user: req.session.usuario, 
      procesos: resultados 
    });
  });
});



// Ruta para búsqueda de productos
router.get('/buscar', requireLogin, async (req, res) => {
  try {
    const termino = req.query.buscar;
    const query = `
      SELECT 
        producto,
        DATE_FORMAT(fecha, '%d/%m/%Y') AS fecha,
        lote,
        DATE_FORMAT(vence, '%d/%m/%Y') AS vence,
        estado_carne AS estado,
        procedencia
      FROM new_temperaturas_produccion
      WHERE 
        activo = TRUE AND
        (producto LIKE ? OR 
         lote LIKE ? OR 
         procedencia LIKE ?)
      ORDER BY fecha DESC
    `;
    sql.query(query, [`%${termino}%`, `%${termino}%`, `%${termino}%`], (err, resultados) => {
      if (err) {
        console.error('Error en la consulta:', err);
        return res.render('home', {
          user: req.session.usuario,
          procesos: [],
          error: 'Error en la búsqueda',
        });
      }
      res.render('home', {
        user: req.session.usuario,
        procesos: resultados,
        busqueda: termino,
      });
    });
  } catch (error) {
    console.error('Error en búsqueda:', error);
    res.render('home', {
      user: req.session.usuario,
      procesos: [],
      error: 'Error en la búsqueda',
    });
  }
});

router.get('/registro', (req, res) => {
  res.render('registro');
});

router.post('/registrar', requireLogin, async (req, res) => {
  const { nombre, cedula, username, contraseña, estacion } = req.body;

  if (!nombre || !cedula || !username || !contraseña || !estacion) {
    return res.render('registro', {
      error: 'Todos los campos son obligatorios',
      valores: { nombre, cedula, username, estacion }
    });
  }

  if (contraseña.length < 8) {
    return res.render('registro', {
      error: 'La contraseña debe tener al menos 8 caracteres',
      valores: { nombre, cedula, username, estacion }
    });
  }

  try {
    sql.query('SELECT id FROM usuario WHERE usuario = ? LIMIT 1', [username], async (err, resultadoUsuario) => {
      if (err) {
        console.error('Error al verificar el usuario:', err);
        return res.render('registro', { 
          error: 'Error al verificar el nombre de usuario', 
          valores: { nombre, cedula, username, estacion }
        });
      }
      if (resultadoUsuario.length > 0) {
        return res.render('registro', { 
          error: 'El nombre de usuario ya está registrado', 
          valores: { nombre, cedula, username, estacion }
        });
      }

      sql.query('SELECT id FROM usuario WHERE cedula = ? LIMIT 1', [cedula], async (err, resultadoCedula) => {
        if (err) {
          console.error('Error al verificar la cédula:', err);
          return res.render('registro', { 
            error: 'Error al verificar la cédula', 
            valores: { nombre, cedula, username, estacion }
          });
        }
        if (resultadoCedula.length > 0) {
          return res.render('registro', { 
            error: 'Ya existe un usuario con la misma cédula', 
            valores: { nombre, cedula, username, estacion }
          });
        }

        const hashContraseña = await bcrypt.hash(contraseña, 10);
        const ROLES = { USUARIO: 'usuario', ADMIN: 'admin' };

        sql.query(
          'INSERT INTO usuario (nombre, cedula, usuario, contraseña, estacion, rol) VALUES (?, ?, ?, ?, ?, ?)',
          [nombre, cedula, username, hashContraseña, estacion, ROLES.USUARIO],
          (err) => {
            if (err) {
              console.error('Error al registrar el usuario:', err);
              return res.render('registro', { 
                error: 'Error al registrar el usuario. Intente nuevamente.', 
                valores: { nombre, cedula, username, estacion }
              });
            }
            return res.redirect('/usuario?registro=exitoso');
          }
        );
      });
    });
  } catch (error) {
    console.error('Error en registro:', error.message);
    return res.render('registro', { 
      error: 'Error al registrar el usuario. Intente nuevamente.', 
      valores: { nombre, cedula, username, estacion }
    });
  }
});

router.get('/usuario', requireLogin, async (req, res) => {
  console.log('User in session:', req.session.usuario);

  try {
    sql.query(
      'SELECT id, nombre, cedula, estacion, usuario, rol, activo FROM usuario ORDER BY nombre ASC', 
      (err, usuarios) => {
        if (err) {
          console.error('Error al listar usuarios:', err);
          return res.render('usuario', { 
            user: req.session.usuario,
            usuarios: [],
            error: 'Error al cargar usuarios'
          });
        }
        res.render('usuario', { 
          user: req.session.usuario,
          usuarios: usuarios
        });
      }
    );
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    res.render('usuario', { 
      user: req.session.usuario,
      usuarios: [],
      error: 'Error al cargar usuarios'
    });
  }
});

// Ruta para cambiar el estado activo/desactivado de un usuario
router.post('/cambiar-estado', requireLogin, (req, res) => {
  const { cedula } = req.body;

  const querySelect = 'SELECT activo FROM usuario WHERE cedula = ?';
  sql.query(querySelect, [cedula], (err, results) => {
    if (err) {
      console.error('Error al obtener el estado del usuario:', err);
      return res.redirect('/usuario?error=cambio_estado');
    }
    if (results.length === 0) {
      return res.redirect('/usuario?error=usuario_no_encontrado');
    }

    const nuevoEstado = !results[0].activo;
    const queryUpdate = 'UPDATE usuario SET activo = ? WHERE cedula = ?';

    sql.query(queryUpdate, [nuevoEstado, cedula], (err) => {
      if (err) {
        console.error('Error al cambiar el estado del usuario:', err);
        return res.redirect('/usuario?error=cambio_estado');
      }
      res.redirect('/usuario');
    });
  });
});

// Ruta para buscar usuarios
router.get('/buscarUser', requireLogin, (req, res) => {
  const { buscar } = req.query;
  if (!buscar || buscar.trim() === '') {
    return res.redirect('/usuario');
  }

  const searchQuery = `
    SELECT id, nombre, cedula, estacion, usuario, rol, activo
    FROM usuario
    WHERE 
      nombre LIKE ? OR
      cedula LIKE ? OR
      usuario LIKE ? OR
      estacion LIKE ?
    ORDER BY nombre ASC
  `;
  const searchParam = `%${buscar}%`;
  const params = [searchParam, searchParam, searchParam];

  sql.query(searchQuery, params, (err, usuarios) => {
    if (err) {
      console.error('Error al buscar usuarios:', err);
      return res.render('usuario', { 
        user: req.session.usuario,
        usuarios: [],
        error: 'Error en la búsqueda'
      });
    }
    res.render('usuario', { 
      user: req.session.usuario,
      usuarios,
      busqueda: buscar
    });
  });
});

// Ruta para modificar usuario
router.get('/modificar/:id', requireLogin, (req, res) => {
  const id = req.params.id;
  sql.query('SELECT * FROM usuario WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('Error al obtener usuario:', err);
      return res.status(500).send('Error al obtener usuario');
    }
    if (result.length > 0) {
      res.render('modificar', { usuario: result[0] });
    } else {
      res.status(404).send('Usuario no encontrado');
    }
  });
});

router.post('/actualizar', requireLogin, (req, res) => {
  const { id, nombre, cedula, numero_estacion, usuario, rol, activo } = req.body;
  const rolValue = rol === 'true' ? 'Administrador' : 'Usuario';

  const query = 'UPDATE usuario SET nombre = ?, cedula = ?, estacion = ?, usuario = ?, activo = ?, rol = ? WHERE id = ?';
  const values = [
    nombre, 
    cedula, 
    numero_estacion, 
    usuario, 
    activo === 'true' ? 1 : 0, 
    rolValue, 
    id
  ];

  sql.query(query, values, (err, result) => {
    if (err) {
      console.error('Error al actualizar el usuario:', err);
      return res.status(500).send('Error al actualizar el usuario');
    }
    sql.query('SELECT * FROM usuario WHERE id = ?', [id], (selectErr, results) => {
      if (selectErr) {
        console.error('Error al verificar el usuario:', selectErr);
        return;
      }
      console.log('Usuario actualizado:', results[0]);
    });
    res.redirect('/usuario');
  });
});

router.get('/informe', requireLogin, (req, res) => {
  const query = `
    SELECT nombre, fecha, lote, archivo
    FROM informe
    ORDER BY fecha DESC
  `;
  sql.query(query, (err, informes) => {
    if (err) {
      console.error('Error al listar informes:', err);
      return res.render('informe', { 
        user: req.session.usuario,
        informes: [],
        error: 'Error al cargar informes',
        busqueda: ''
      });
    }
    res.render('informe', { 
      user: req.session.usuario,
      informes,
      busqueda: ''
    });
  });
});

// Ruta para buscar informes
router.get('/buscarInforme', requireLogin, (req, res) => {
  const { buscar } = req.query;
  if (!buscar || buscar.trim() === '') {
    return res.redirect('/informe');
  }

  const searchQuery = `
    SELECT nombre, fecha, lote, archivo
    FROM informe
    WHERE 
      nombre LIKE ? OR
      lote LIKE ?
    ORDER BY fecha DESC
  `;
  const searchParam = `%${buscar}%`;
  const params = [searchParam, searchParam];

  sql.query(searchQuery, params, (err, informes) => {
    if (err) {
      console.error('Error al buscar informes:', err);
      return res.render('informe', { 
        user: req.session.usuario,
        informes: [],
        error: 'Error en la búsqueda',
        busqueda: buscar
      });
    }
    res.render('informe', { 
      user: req.session.usuario,
      informes,     
      busqueda: buscar
    });
  });
});

// Ruta para descargar informes
router.get('/descargar/:archivo', requireLogin, (req, res) => {
  const archivo = req.params.archivo;
  const filePath = path.join(__dirname, '../uploads', archivo);

  res.download(filePath, (err) => {
    if (err) {
      console.error('Error al descargar archivo:', err);
      res.status(404).send('Archivo no encontrado');
    }
  });
});

// Ruta GET para mostrar el formulario de agregar proceso
router.get('/proceso', requireLogin, (req, res) => {
  res.render('proceso');
});

// Ruta POST para agregar un nuevo proceso 
router.post('/Agregarproceso', requireLogin, (req, res) => {
  const { nombre, encargado } = req.body;

  if (!nombre || !encargado) {
    return res.status(400).send('Faltan datos');
  }

  const query = 'INSERT INTO proceso (nombre, estacion) VALUES (?, ?)';
  sql.query(query, [nombre, encargado], (err, result) => {
    if (err) {
      console.error('Error al agregar el proceso:', err);
      return res.status(500).send('Error al agregar el proceso');
    }
    res.redirect('/proceso_list');
  });
});

// Ruta para listar los procesos
router.get('/proceso_list', requireLogin, (req, res) => {
  sql.query('SELECT * FROM proceso WHERE estado = 1', (err, resultados) => {
    if (err) {
      console.error('Error al obtener los procesos:', err);
      res.status(500).send('Error al obtener los procesos');
    } else {
      res.render('proceso_list', { procesos: resultados });
    }
  });
});

// Ruta para buscar un proceso
router.get('/buscarProceso', requireLogin, (req, res) => {
  const { buscar } = req.query;
  if (!buscar || buscar.trim() === '') {
    return res.redirect('/proceso_list');
  }

  const searchQuery = `
      SELECT id, nombre, estacion
      FROM proceso
      WHERE 
          nombre LIKE ? OR
          estacion LIKE ?
      ORDER BY nombre ASC
  `;
  const searchParam = `%${buscar}%`;
  sql.query(searchQuery, [searchParam, searchParam], (err, procesos) => {
    if (err) {
      console.error('Error al buscar proceso:', err);
      return res.render('proceso_list', { 
        user: req.session.usuario,
        procesos: [],
        error: 'Error en la búsqueda'
      });
    }
    res.render('proceso_list', { 
      user: req.session.usuario,
      procesos,  
      busqueda: buscar
    });
  });
});

// Ruta para actualizar un proceso
router.post('/actualizarProceso', requireLogin, (req, res) => {
  const { id, nombre, estacion } = req.body;
  if (!id || !nombre || !estacion) {
    return res.json({ success: false, message: "Datos incompletos" });
  }
  const query = 'UPDATE proceso SET nombre = ?, estacion = ? WHERE id = ?';
  sql.query(query, [nombre, estacion, id], (err) => {
    if (err) {
      console.error('Error al actualizar proceso:', err);
      return res.json({ success: false, message: "Error en la base de datos" });
    }
    return res.redirect('/proceso_list');
  });
});

// Ruta para desactivar un proceso
router.get('/desactivarProceso/:id', requireLogin, (req, res) => {
  const { id } = req.params;
  const query = 'UPDATE proceso SET estado = 0 WHERE id = ?';
  sql.query(query, [id], (err) => {
    if (err) {
      console.error('Error al desactivar el proceso:', err);
      return res.status(500).send('Error en la base de datos');
    }
    res.redirect('/proceso_list');
  });
});

// Ruta para activar un proceso
router.get('/activarProceso/:id', requireLogin, (req, res) => {
  const { id } = req.params;
  const query = 'UPDATE proceso SET estado = 1 WHERE id = ?';
  sql.query(query, [id], (err) => {
    if (err) {
      console.error('Error al activar el proceso:', err);
      return res.status(500).send('Error en la base de datos');
    }
    res.redirect('/proceso_list');
  });
});

// Configuración de multer para la subida de archivos
//Multer funciona para guradar los archivos en la carpeta destinada que es ./uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Asegúrate de que este directorio exista
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Ruta para insertar datos en temperaturas_produccion
router.post('/proceso1', requireLogin, upload.single('evidencia'), (req, res) => {
  const {
    producto_elaborado,
    pulpa_cerdo_temp_max,
    pulpa_res_temp_max,
    tocino_temp_max,
    pasta_temp_max,
    emulsion_temp_max,
    repele_res_temp_max,
    repele_cerdo_temp_max,
    mezcla_temp_max,
    observaciones,
    lote
  } = req.body;

  let evidencia = null;
  if (req.file) {
    evidencia = req.file.path;
  }

  const maxTemperaturas = {
    pulpa_cerdo_temp_max: 6,
    pulpa_res_temp_max: 6,
    tocino_temp_max: 6,
    pasta_temp_max: 2,
    emulsion_temp_max: 6,
    repele_res_temp_max: 6,
    repele_cerdo_temp_max: 6,
    mezcla_temp_max: 6
  };

  const valores = {};
  let observacionesCompletas = observaciones || '';

  for (let key in maxTemperaturas) {
    if (req.body[key]) {
      const valor = parseFloat(req.body[key]);
      valores[key] = valor;
      if (valor > maxTemperaturas[key]) {
        observacionesCompletas += `\n${key}: Excede el máximo permitido de ${maxTemperaturas[key]}°C`;
      }
    }
  }

  const query = `
  INSERT INTO new_temperaturas_produccion (
    pulpa_cerdo_temp_max, pulpa_res_temp_max, tocino_temp_max, 
    pasta_temp_max, emulsion_temp_max,
    repele_res_temp_max, repele_cerdo_temp_max, mezcla_temp_max, 
    observaciones, evidencia, producto_elaborado, lote
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;


  sql.query(query, [
    valores.pulpa_cerdo_temp_max || null,
    valores.pulpa_res_temp_max || null,
    valores.tocino_temp_max || null,
    valores.pasta_temp_max || null,
    valores.emulsion_temp_max || null,
    valores.repele_res_temp_max || null,
    valores.repele_cerdo_temp_max || null,
    valores.mezcla_temp_max || null,
    observacionesCompletas,
    evidencia,
    producto_elaborado,
    lote
  ], (err, result) => {
    if (err) {
      console.error('Error al insertar en temperaturas_produccion:', err);
      return res.status(500).send('Error interno del servidor.');
    }
    res.redirect('/produccion');
  });
});

// Ruta para producción (por ejemplo, estación 01)
router.get('/produccion', requireLogin, (req, res) => {
  res.render('estacion01');
});


// Ruta para cerrar sesión
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error al cerrar sesión:', err);
      return res.redirect('/home'); // Si falla, redirige a una página segura
    }
    res.redirect('/'); // Redirige al login después de cerrar sesión
  });
});


// Ruta para cocción y enfriamiento (por ejemplo, estación 02)
router.get('/coccionenfri', requireLogin, (req, res) => {
  res.render('estacion02');
});

router.post('/proceso2', requireLogin, upload.single('evidencia'), (req, res) => {
  // Recogemos los datos del formulario
  const {
    producto_elaborado,
    temp_antes_cocinar,
    temp_coccion,
    temp_despues_choque,
    observaciones,
    hora_separacion,
    temp_separacion,
  } = req.body;

  // Comprobamos si se cargó el archivo
  const evidencia = req.file ? req.file.path : null;  // Guardamos el archivo en el directorio 'uploads/'

  // SQL Query para insertar los datos en la base de datos
  const query = `INSERT INTO new_temperaturas_coccion_enfriamiento 
    (producto_elaborado, temp_antes_cocinar, temp_coccion, temp_despues_choque, observaciones, hora_separacion, temp_separacion, evidencia) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  // Valores que se insertarán en la base de datos
  const values = [
    producto_elaborado,
    temp_antes_cocinar,
    temp_coccion,
    temp_despues_choque,
    observaciones,
    hora_separacion,
    temp_separacion,
    evidencia,
  ];

  // Ejecutamos la query
  sql.query(query, values, (err, result) => {
    if (err) {
      console.error("Error al insertar datos:", err);
      return res.status(500).send("Error al guardar los datos.");
    }
    console.log("Datos insertados correctamente");
    res.redirect("/coccionenfri"); 
  });
});

// Ruta para cocción y enfriamiento (por ejemplo, estación 03) 
router.get('/cavas', requireLogin, (req, res) => {
  res.render('estacion03');
});

router.post('/proceso3', upload.single('evidencia'), (req, res) => {
    console.log("Formulario recibido");
    console.log("Datos recibidos:", req.body);
    console.log("Archivo recibido:", req.file);
  
    const {
      producto_elaborado,
      cava_6_max,
      cava_choque,
      area_coccion_temp_max,
      cava_7_max,
      area_empaque_temp_max,
      area_produccion_temp_max,
      observaciones
    } = req.body;
    const evidencia = req.file ? req.file.path : null;

    // Consulta SQL usando placeholders para TODOS los valores excepto el autoincrementable
    const query = `
      INSERT INTO temperaturas_cavas_areas
        (cava_6_max, cava_7_max, cava_choque, area_empaque_temp_max, area_coccion_temp_max, area_produccion_temp_max, observaciones, evidencia, producto_elaborado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
  
    // Arreglo de parámetros en el mismo orden
    const values = [
      cava_6_max,
      cava_7_max,
      cava_choque,
      area_empaque_temp_max,
      area_coccion_temp_max,
      area_produccion_temp_max,
      observaciones,
      evidencia,
      producto_elaborado
    ];
  
    sql.query(query, values, (error, results) => {
      if (error) {
        console.error('Error al insertar datos:', error);
        return res.status(500).send('Error al guardar los datos.');
      }
      console.log('Datos insertados correctamente, ID:', results.insertId);
      res.redirect('/cavas');
    });
  });

router.get('/empaque', requireLogin, (req, res) => {
  res.render('estacion04');
});

router.post('/proceso4', requireLogin, (req, res) => {
  const {
    producto_elaborado,
    fecha_empaque,
    temp_antes_tajar,
    temp_antes_empacar,
    observaciones
  } = req.body;

  const maxTemperaturas = {
    temp_antes_tajar: 6,
    temp_antes_empacar: 6,
  };

  let observacionesCompletas = observaciones || '';

  // Verificación de temperaturas
  const valores = {
    temp_antes_tajar: temp_antes_tajar ? parseFloat(temp_antes_tajar) : null,
    temp_antes_empacar: temp_antes_empacar ? parseFloat(temp_antes_empacar) : null
  };

  for (let key in maxTemperaturas) {
    if (valores[key] !== null && valores[key] > maxTemperaturas[key]) {
      observacionesCompletas += `\n${key}: Excede el máximo permitido de ${maxTemperaturas[key]}°C`;
    }
  }

  const query = `INSERT INTO control_empaque 
    (producto_elaborado, fecha_empaque, temp_antes_tajar, temp_antes_empacar, observaciones) 
    VALUES (?, ?, ?, ?, ?)`;

  sql.query(query, [
    producto_elaborado,
    fecha_empaque || null,
    valores.temp_antes_tajar,
    valores.temp_antes_empacar,
    observacionesCompletas
  ], (err, result) => {
    if (err) {
      console.error('Error al insertar en control_empaque:', err);
      return res.status(500).send('Error interno del servidor.');
    }
    res.redirect('/empaque');
  });
});

module.exports = router;
