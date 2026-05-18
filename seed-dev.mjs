import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGO_URI = "mongodb+srv://polea56_db_user:Et8DjrBG1W6hhfnR@clustertodo.birdmel.mongodb.net/?appName=Clustertodo";

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  nombre:   String,
  rol:      String,
  activo:   Boolean,
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

async function main() {
  await mongoose.connect(MONGO_URI, { dbName: "test" });
  console.log("Conectado a MongoDB");

  await mongoose.connection.collection("users").deleteMany({});
  console.log("Usuarios viejos eliminados");

  const hash = await bcrypt.hash("AlexOlea13@", 12);
  await User.create({
    username: "alec.dev",
    password: hash,
    nombre:   "Alec Olea",
    rol:      "developer",
    activo:   true,
  });
  console.log("✅ Usuario developer creado: alec.dev");

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });