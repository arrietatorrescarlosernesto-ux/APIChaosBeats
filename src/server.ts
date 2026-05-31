import { app } from "./app";
import { env } from "./config/env";

const port = process.env.PORT ? Number(process.env.PORT) : env.PORT;

app.listen(port, "0.0.0.0", () => {
  console.log(`Chaos Beats Music API escuchando en http://0.0.0.0:${port}`);
});
