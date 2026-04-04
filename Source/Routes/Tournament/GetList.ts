import { Router } from "express";
import j from "joi";
import { ValidateBody, ValidateHeaders } from "../../Modules/Middleware";
import { GetTournamentList } from "../../Backbone/Logic/TournamentList";

const App = Router();
const TournamentListSchema = j
  .object({
    backbone_app_id: j.string().required().valid("8561191D-03B7-423E-B779-D2F6E77A3A45"),
    "x-unity-version": j.string().required(),
    access_token: j.string().required(),
  })
  .unknown(true);

const GetListBodySchema = j
  .object({
    sinceDate: j.date().required(),
    untilDate: j.date().required(),
    maxResults: j.number().required(),
    page: j.number().required(),
    accessToken: j.string().required(),
  })
  .unknown(true);

App.post(
  "/tournamentGetList",
  ValidateHeaders(TournamentListSchema),
  ValidateBody(GetListBodySchema),
  async (req, res) => {
    const Data = await GetTournamentList(
      req.body.maxResults as number,
      req.body.page as number,
      req.body.accessToken as string
    );
    res.json(Data).status(200);
  }
);
export default {
  App,
  DefaultAPI: "/api/v2",
};
