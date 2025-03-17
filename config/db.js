const mysql = require('mysql');

const sql = mysql.createConnection({
  host: 'localhost', 
  user: 'root',      
  password: '',      
  database: 'sgtdp', 
  port: 3306
});

sql.connect((err) => {
  if (err) {
    console.error('Error conectando a la base de datos:', err.message);
    return;
  }
  console.log('Conexión exitosa a la base de datos.');
});

module.exports = sql;
