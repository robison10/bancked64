import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { CreateTournament } from "./Database";
import { Emotes, Scenes, Regions } from "../Backbone/Config";
import { GeneratePrizepoolId } from "../Modules/Extensions";
import { Tournament } from "../Models/Tournament";
import { msg } from "../Modules/Logger";

export const Bot = new Client({ intents: [GatewayIntentBits.Guilds] });
const Rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN || "MTQ2NDc0MjI2ODgyNDE5MTIyMA.Gusm43.1715b5jUInU1w9qUxLUciNycsgiGcBOAVbBWuY");

const regionChoices = Object.keys(Regions).map((name) => ({
  name,
  value: Regions[name as keyof typeof Regions],
}));

const ALLOWED_ROLE_IDS = [
  "1439786066147151953",
  "1462860407374086307",
  "1439786066147151953"
];

function hasPermission(interaction: any): boolean {
  // Allow if no guild (DMs) or if user has administrator permission
  if (!interaction.guild || interaction.member?.permissions?.has("Administrator")) {
    return true;
  }

  // Check if user has any of the allowed roles
  const memberRoles = interaction.member?.roles?.cache;
  if (!memberRoles) return false;

  return ALLOWED_ROLE_IDS.some(roleId => memberRoles.has(roleId));
}

const Commands = [
  new SlashCommandBuilder()
    .setName("create")
    .setDescription("make tournament")
    .addStringOption((opt) => opt.setName("name").setDescription("tournament name").setRequired(true))
    .addIntegerOption((opt) => opt.setName("players").setDescription("max players").setRequired(true))
    .addIntegerOption((opt) => opt.setName("start").setDescription("starts in minutes").setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName("region")
        .setDescription("region")
        .setRequired(true)
        .addChoices(...regionChoices)
    )
    .addStringOption((opt) =>
      opt
        .setName("type")
        .setDescription("phase type")
        .setRequired(true)
        .addChoices(
          { name: "roundrobin", value: "roundrobin" },
          { name: "bracket", value: "bracket" },
          { name: "arena", value: "arena" }
        )
    )
    .addIntegerOption((opt) => opt.setName("rounds").setDescription("rounds").setRequired(true))
    .addIntegerOption((opt) => opt.setName("party").setDescription("party size").setRequired(false))
    .addIntegerOption((opt) => opt.setName("fee").setDescription("entry fee").setRequired(false))
    .addIntegerOption((opt) => opt.setName("maxteams").setDescription("max teams per phase").setRequired(false))
    .addStringOption((opt) => opt.setName("maps").setDescription("maps separated by commas").setRequired(false))
    .addStringOption((opt) =>
      opt
        .setName("phases")
        .setDescription("additional phases: type,rounds,maxteams,maps|type,rounds...")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("emotepreset")
        .setDescription("disabled emote preset")
        .setRequired(false)
        .addChoices({ name: "Punch Only", value: "-2" }, { name: "Special Emotes", value: "-1" })
    )
    .addStringOption((opt) =>
      opt.setName("disabledemotes").setDescription("disabled emotes (comma separated names or IDs)").setRequired(false)
    )
    .addStringOption((opt) => opt.setName("image").setDescription("image url").setRequired(false))
    .addStringOption((opt) => opt.setName("color").setDescription("color hex").setRequired(false))
    .addBooleanOption((opt) => opt.setName("invite").setDescription("invite only").setRequired(false))
    .toJSON(),

  new SlashCommandBuilder()
    .setName("list")
    .setDescription("show tournaments")
    .addStringOption((opt) =>
      opt
        .setName("region")
        .setDescription("region filter")
        .setRequired(false)
        .addChoices(...regionChoices)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("status")
        .setDescription("status filter")
        .setRequired(false)
        .addChoices(
          { name: "not started", value: 0 },
          { name: "open", value: 1 },
          { name: "closed", value: 2 },
          { name: "finished", value: 3 },
          { name: "canceled", value: 4 },
          { name: "running", value: 5 }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("delete")
    .setDescription("delete tournament")
    .addStringOption((opt) => opt.setName("id").setDescription("id").setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName("edit")
    .setDescription("edit tournament")
    .addStringOption((opt) => opt.setName("id").setDescription("id").setRequired(true))
    .addStringOption((opt) => opt.setName("name").setDescription("name").setRequired(false))
    .addIntegerOption((opt) => opt.setName("max").setDescription("max players").setRequired(false))
    .addIntegerOption((opt) => opt.setName("fee").setDescription("entry fee").setRequired(false))
    .addStringOption((opt) =>
      opt
        .setName("emotepreset")
        .setDescription("disabled emote preset")
        .setRequired(false)
        .addChoices({ name: "Punch Only", value: "-2" }, { name: "Disable Special Emotes", value: "-1" })
    )
    .addStringOption((opt) =>
      opt
        .setName("disabledemotes")
        .setDescription("disabled emotes (comma separated names) eg. (Punch, Kick)")
        .setRequired(false)
    )
    .toJSON(),
];

function parseEmotes(emotesInput: string): number[] {
  return emotesInput
    .split(",")
    .map((e) => {
      const trimmed = e.trim();
      const emoteId = Emotes[trimmed as keyof typeof Emotes];
      if (emoteId !== undefined) {
        return emoteId;
      }
      const parsed = parseInt(trimmed);
      return isNaN(parsed) ? null : parsed;
    })
    .filter((id): id is number => id !== null);
}

function getEmoteNames(emoteIds: number[]): string {
  return emoteIds
    .map((id) => {
      const name = Object.keys(Emotes).find((key) => Emotes[key as keyof typeof Emotes] === id);
      return name || `ID:${id}`;
    })
    .join(", ");
}

async function setup() {
  try {
    await Rest.put(Routes.applicationGuildCommands("1439759324418277459", "1439759324418277459"), {
      body: Commands,
    });
    msg("commands ready");
  } catch (e) {
    console.error("setup failed:", e);
  }
}

Bot.once("clientReady", async () => {
  msg(`logged in as ${Bot.user?.tag}`);
  await setup();
});

Bot.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const cmd = interaction.commandName;

    if (cmd === "create") {
      if (!hasPermission(interaction)) {
        await interaction.reply({
          content: "❌ You don't have permission to create Classic Tournaments",
          ephemeral: true
        });
        return;
      }

      try {
        await interaction.deferReply();

        const name = interaction.options.getString("name", true);
        const max = interaction.options.getInteger("players", true);
        const start = interaction.options.getInteger("start", true);
        const region = interaction.options.getString("region", true);
        const typeStr = interaction.options.getString("type", true);
        const rounds = interaction.options.getInteger("rounds", true);
        const party = interaction.options.getInteger("party") || 2;
        const fee = interaction.options.getInteger("fee") || 0;
        const maxTeams = interaction.options.getInteger("maxteams") || 200;
        const mapsInput = interaction.options.getString("maps") || "Block Dash";
        const phasesInput = interaction.options.getString("phases");
        const emotePreset = interaction.options.getString("emotepreset");
        const disabledEmotesInput = interaction.options.getString("disabledemotes");
        const img = interaction.options.getString("image") || "https://i.imgur.com/0ZQZ0ZQ.png";
        const color = interaction.options.getString("color") || "#daef20";
        const inviteOnly = interaction.options.getBoolean("invite") || false;

        const phaseType = typeStr === "arena" ? 1 : typeStr === "bracket" ? 2 : 3;

        const maps = mapsInput
          .split(",")
          .map((m) => {
            const trimmed = m.trim();
            return Scenes[trimmed as keyof typeof Scenes] || trimmed;
          })
          .filter(Boolean);

        let disabledEmotes: number[] = [];
        if (emotePreset) {
          disabledEmotes = [parseInt(emotePreset)];
        } else if (disabledEmotesInput) {
          disabledEmotes = parseEmotes(disabledEmotesInput);
        }

        const phases = [
          {
            PhaseType: phaseType,
            IsPhase: phaseType === 3,
            RoundCount: rounds,
            MaxTeams: maxTeams,
            GroupCount: 1,
            Maps: maps,
          },
        ];

        if (phasesInput) {
          const phasesList = phasesInput.split("|");
          for (const phaseStr of phasesList) {
            const [type, rds, mt, mps] = phaseStr.split(",");
            if (!type || !rds) continue;

            const pType = type.trim() === "arena" ? 1 : type.trim() === "bracket" ? 2 : 3;
            const pRounds = parseInt(rds.trim());
            const pMaxTeams = mt ? parseInt(mt.trim()) : 200;
            const pMaps = mps
              ? mps
                  .split(";")
                  .map((m) => {
                    const t = m.trim();
                    return Scenes[t as keyof typeof Scenes] || t;
                  })
                  .filter(Boolean)
              : maps;

            phases.push({
              PhaseType: pType,
              IsPhase: pType === 3,
              RoundCount: pRounds,
              MaxTeams: pMaxTeams,
              GroupCount: 1,
              Maps: pMaps,
            });
          }
        }

        const id = Date.now().toString();
        const startTime = new Date(Date.now() + start * 60000);

        await CreateTournament({
          CurrentInvites: 0,
          MaxInvites: max,
          TournamentId: id,
          TournamentName: name,
          TournamentImage: img,
          TournamentColor: color,
          StartTime: startTime,
          SignupStart: new Date(),
          EntryFee: fee,
          PrizepoolId: GeneratePrizepoolId().toString(),
          PartySize: party,
          Status: 1,
          TournamentType: 1,
          Phases: phases,
          Region: region,
          RoundCount: rounds,
          CurrentPhaseId: 0,
          MinPlayersPerMatch: 2,
          MaxPlayersPerMatch: 2,
          Properties: {
            IsInvitationOnly: inviteOnly,
            InvitedIds: [],
            DisabledEmotes: disabledEmotes,
            AdminIds: [],
            StreamURL: "",
          },
        });

        const e = new EmbedBuilder()
          .setTitle("created")
          .setColor(color as any)
          .setDescription(`**${name}**`)
          .addFields(
            { name: "id", value: `\`${id}\``, inline: false },
            { name: "max", value: max.toString(), inline: true },
            { name: "party", value: party.toString(), inline: true },
            { name: "region", value: region.toUpperCase(), inline: true },
            { name: "type", value: typeStr, inline: true },
            { name: "rounds", value: rounds.toString(), inline: true },
            { name: "fee", value: fee.toString(), inline: true },
            { name: "phases", value: phases.length.toString(), inline: true },
            { name: "starts", value: `<t:${Math.floor(startTime.getTime() / 1000)}:R>`, inline: false }
          )
          .setTimestamp();

        if (disabledEmotes.length > 0) {
          e.addFields({
            name: "disabled emotes",
            value: getEmoteNames(disabledEmotes),
            inline: false,
          });
        }

        if (img) e.setThumbnail(img);

        await interaction.editReply({ embeds: [e] });
      } catch (err) {
        console.error("create error:", err);
        await interaction.editReply({ content: `failed: ${err}` });
      }
    }

    if (cmd === "list") {
      if (!hasPermission(interaction)) {
        await interaction.reply({
          content: "❌ You don't have permission to use this command",
          ephemeral: true
        });
        return;
      }

      try {
        const rf = interaction.options.getString("region");
        const sf = interaction.options.getInteger("status");

        const q: any = {};
        if (rf) q.Region = rf;
        if (sf !== null) q.Status = sf;

        const tours = await Tournament.find(q).limit(10).sort({ StartTime: 1 });

        if (!tours.length) {
          await interaction.reply({ content: "no tournaments", ephemeral: true });
          return;
        }

        const e = new EmbedBuilder()
          .setTitle("tournaments")
          .setDescription(`showing ${tours.length}`)
          .setColor("#5865f2")
          .setTimestamp();

        for (const t of tours) {
          const ts = Math.floor(new Date(t.StartTime).getTime() / 1000);
          const st = t.Status === 1 ? "open" : t.Status === 2 ? "closed" : t.Status === 5 ? "running" : "done";

          const disabledEmotesText =
            t.Properties?.DisabledEmotes?.length > 0
              ? `\ndisabled emotes: ${getEmoteNames(t.Properties.DisabledEmotes)}`
              : "";

          e.addFields({
            name: `${t.TournamentName} [${st}]`,
            value: `id: \`${t.TournamentId}\`\nplayers: ${t.CurrentInvites}/${t.MaxInvites}\nregion: ${t.Region} | fee: ${t.EntryFee}\nstarts: <t:${ts}:R>${disabledEmotesText}`,
            inline: false,
          });
        }

        await interaction.reply({ embeds: [e] });
      } catch (err) {
        console.error("list error:", err);
        await interaction.reply({ content: "failed", ephemeral: true });
      }
    }

    if (cmd === "delete") {
      if (!hasPermission(interaction)) {
        await interaction.reply({
          content: "❌ You don't have permission to use this command",
          ephemeral: true
        });
        return;
      }

      try {
        const id = interaction.options.getString("id", true);
        const res = await Tournament.deleteOne({ TournamentId: id });

        if (res.deletedCount === 0) {
          await interaction.reply({ content: "not found", ephemeral: true });
          return;
        }

        const e = new EmbedBuilder()
          .setTitle("deleted")
          .setDescription(`deleted \`${id}\``)
          .setColor("#ff4444")
          .setTimestamp();

        await interaction.reply({ embeds: [e] });
      } catch (err) {
        console.error("delete error:", err);
        await interaction.reply({ content: "failed", ephemeral: true });
      }
    }

    if (cmd === "edit") {
      if (!hasPermission(interaction)) {
        await interaction.reply({
          content: "❌ You don't have permission to use this command",
          ephemeral: true
        });
        return;
      }

      try {
        const id = interaction.options.getString("id", true);
        const u: any = {};

        const name = interaction.options.getString("name");
        const max = interaction.options.getInteger("max");
        const fee = interaction.options.getInteger("fee");
        const emotePreset = interaction.options.getString("emotepreset");
        const disabledEmotesInput = interaction.options.getString("disabledemotes");

        if (name) u.TournamentName = name;
        if (max) u.MaxInvites = max;
        if (fee !== null) u.EntryFee = fee;

        if (emotePreset) {
          u["Properties.DisabledEmotes"] = [parseInt(emotePreset)];
        } else if (disabledEmotesInput) {
          u["Properties.DisabledEmotes"] = parseEmotes(disabledEmotesInput);
        }

        if (!Object.keys(u).length) {
          await interaction.reply({ content: "no changes", ephemeral: true });
          return;
        }

        const res = await Tournament.updateOne({ TournamentId: id }, { $set: u });

        if (res.matchedCount === 0) {
          await interaction.reply({ content: "not found", ephemeral: true });
          return;
        }

        const e = new EmbedBuilder()
          .setTitle("updated")
          .setDescription(`updated \`${id}\``)
          .setColor("#43b581")
          .setTimestamp();

        for (const [k, v] of Object.entries(u)) {
          if (k === "Properties.DisabledEmotes" && Array.isArray(v)) {
            e.addFields({ name: "disabled emotes", value: getEmoteNames(v), inline: true });
          } else {
            e.addFields({ name: k, value: String(v), inline: true });
          }
        }

        await interaction.reply({ embeds: [e] });
      } catch (err) {
        console.error("edit error:", err);
        await interaction.reply({ content: "failed", ephemeral: true });
      }
    }
  }
});
