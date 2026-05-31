import { Router } from "express";
import * as artists from "../controllers/artistController";

export const artistRoutes = Router();

artistRoutes.get("/", artists.list);
