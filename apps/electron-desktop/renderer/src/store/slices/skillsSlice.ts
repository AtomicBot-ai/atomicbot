import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { ClawHubSkillItem } from "../../ui/settings/skills/clawhub/useClawHubSkills";
import type { CustomSkillMeta } from "../../ui/settings/skills/useCustomSkills";

export type ClawHubCacheState = {
  items: ClawHubSkillItem[];
  totalPages: number;
  /** Serialized query+sort+filter key of the last successful first-page fetch. */
  lastFetchKey: string | null;
};

export type CustomSkillsCacheState = {
  items: CustomSkillMeta[];
  loaded: boolean;
};

export type SkillsSliceState = {
  clawhub: ClawHubCacheState;
  custom: CustomSkillsCacheState;
};

const initialState: SkillsSliceState = {
  clawhub: {
    items: [],
    totalPages: 0,
    lastFetchKey: null,
  },
  custom: {
    items: [],
    loaded: false,
  },
};

const skillsSlice = createSlice({
  name: "skills",
  initialState,
  reducers: {
    setClawHubSkills(
      state,
      action: PayloadAction<{ items: ClawHubSkillItem[]; totalPages: number; fetchKey: string }>
    ) {
      state.clawhub.items = action.payload.items;
      state.clawhub.totalPages = action.payload.totalPages;
      state.clawhub.lastFetchKey = action.payload.fetchKey;
    },
    appendClawHubSkills(
      state,
      action: PayloadAction<{ items: ClawHubSkillItem[]; totalPages: number }>
    ) {
      state.clawhub.items = [...state.clawhub.items, ...action.payload.items];
      state.clawhub.totalPages = action.payload.totalPages;
    },
    clearClawHub(state) {
      state.clawhub.items = [];
      state.clawhub.totalPages = 0;
      state.clawhub.lastFetchKey = null;
    },

    setCustomSkills(state, action: PayloadAction<CustomSkillMeta[]>) {
      state.custom.items = action.payload;
      state.custom.loaded = true;
    },
    addCustomSkill(state, action: PayloadAction<CustomSkillMeta>) {
      const skill = action.payload;
      const idx = state.custom.items.findIndex((s) => s.dirName === skill.dirName);
      if (idx >= 0) {
        state.custom.items[idx] = skill;
      } else {
        state.custom.items.push(skill);
      }
    },
    removeCustomSkill(state, action: PayloadAction<string>) {
      state.custom.items = state.custom.items.filter((s) => s.dirName !== action.payload);
    },
  },
});

export const skillsActions = skillsSlice.actions;
export const skillsReducer = skillsSlice.reducer;
