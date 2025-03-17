const bcrypt = require('bcrypt');
const readline = require('readline');

const saltRounds = 12;  

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Introduce la contraseña para generar el hash: ', async (contraseña) => {
  try {
    // Generar el hash
    const hash = await bcrypt.hash(contraseña, saltRounds);
    console.log('Hash generado:', hash);
  } catch (error) {
    console.error('Error generando el hash:', error);
  } finally {
    rl.close();
  }
});
