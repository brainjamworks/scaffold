export interface ScaffoldProductAccess {
  readonly scaffoldPlusAuthorized: boolean;
}

export interface RequiresScaffoldPlusResult {
  readonly status: "requires-scaffold-plus";
}
