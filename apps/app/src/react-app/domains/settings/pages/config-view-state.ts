export type MatterhornTestState = "idle" | "testing" | "success" | "error";

export type MatterhornConnectionState = {
  url: string;
  token: string;
  testState: MatterhornTestState;
  testMessage: string | null;
};

export type TokenVisibilityKey = "matterhorn" | "client" | "owner" | "host";

type ConfigLocalState = {
  matterhornConnection: MatterhornConnectionState;
  tokenVisible: Record<TokenVisibilityKey, boolean>;
  copyingField: string | null;
};

type ConfigLocalAction =
  | { type: "serverSettings"; connection: MatterhornConnectionState }
  | { type: "url"; url: string }
  | { type: "token"; token: string }
  | { type: "testState"; testState: MatterhornTestState; testMessage: string | null }
  | { type: "toggleToken"; key: TokenVisibilityKey }
  | { type: "copyingField"; field: string | null };

export const initialConfigLocalState: ConfigLocalState = {
  matterhornConnection: {
    url: "",
    token: "",
    testState: "idle",
    testMessage: null,
  },
  tokenVisible: {
    matterhorn: false,
    client: false,
    owner: false,
    host: false,
  },
  copyingField: null,
};

export function configLocalReducer(
  state: ConfigLocalState,
  action: ConfigLocalAction,
): ConfigLocalState {
  switch (action.type) {
    case "serverSettings":
      return { ...state, matterhornConnection: action.connection };
    case "url":
      return {
        ...state,
        matterhornConnection: {
          ...state.matterhornConnection,
          url: action.url,
          testState: "idle",
          testMessage: null,
        },
      };
    case "token":
      return {
        ...state,
        matterhornConnection: {
          ...state.matterhornConnection,
          token: action.token,
          testState: "idle",
          testMessage: null,
        },
      };
    case "testState":
      return {
        ...state,
        matterhornConnection: {
          ...state.matterhornConnection,
          testState: action.testState,
          testMessage: action.testMessage,
        },
      };
    case "toggleToken":
      return {
        ...state,
        tokenVisible: {
          ...state.tokenVisible,
          [action.key]: !state.tokenVisible[action.key],
        },
      };
    case "copyingField":
      return { ...state, copyingField: action.field };
  }
}
