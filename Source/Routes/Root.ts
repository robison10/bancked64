import { Router } from "express";
import { ForService, ServiceType } from "../Modules/Service";

const App = Router();

App.use(ForService(ServiceType.Public));

App.get("/", (_, res) => res.send("Tournament-SDK | Made by Rax"));

App.post("/", (_, res) => res.send("Tournament-SDK | Made by Rax"));

export default {
  App,
  DefaultAPI: "/",
};
