# Changelog

## [0.4.0](https://github.com/Cadenway/cadenway-task-service/compare/v0.3.0...v0.4.0) (2026-11-23)


### Features

* **access:** serve grants, access requests and the access checks with the effective role ([#32](https://github.com/Cadenway/cadenway-task-service/issues/32)) ([de02b6f](https://github.com/Cadenway/cadenway-task-service/commit/de02b6fccc6f3aa89c6f0c1884b2071dc4cc9195))
* **archives:** archive and restore lists and tasks with their subtrees ([#33](https://github.com/Cadenway/cadenway-task-service/issues/33)) ([bc9a740](https://github.com/Cadenway/cadenway-task-service/commit/bc9a740c5f6184875fc02843fe74c88f56accbe8))
* **collaboration:** add comments, mentions, participants and watchers ([#37](https://github.com/Cadenway/cadenway-task-service/issues/37)) ([e5ba231](https://github.com/Cadenway/cadenway-task-service/commit/e5ba2311de6b4ebcc77841fcb2b76346ea1c9c3d))
* **intake:** claim anonymous attachment reservations with task submission ([#53](https://github.com/Cadenway/cadenway-task-service/issues/53)) ([69b9bb6](https://github.com/Cadenway/cadenway-task-service/commit/69b9bb6beb40c9b88fb92b4bd89345d6c8d30156))
* **members:** keep a copy of the organization memberships ([#27](https://github.com/Cadenway/cadenway-task-service/issues/27)) ([c4f16f5](https://github.com/Cadenway/cadenway-task-service/commit/c4f16f5544bd475c9875da09c5912d4dddb51c29))
* **spaces:** add spaces, lists and sprints with their access rules ([#29](https://github.com/Cadenway/cadenway-task-service/issues/29)) ([3f7d522](https://github.com/Cadenway/cadenway-task-service/commit/3f7d522433d3fb722d5f1ee37d35ff612380b585))
* **spaces:** resolve current document access ([#54](https://github.com/Cadenway/cadenway-task-service/issues/54)) ([4f25cda](https://github.com/Cadenway/cadenway-task-service/commit/4f25cda9070f13c8007258a5ff5ca5c9c7fb446e))
* **task:** resolve batch visibility and separate the outbox relay ([#61](https://github.com/Cadenway/cadenway-task-service/issues/61)) ([a76b406](https://github.com/Cadenway/cadenway-task-service/commit/a76b4060b4255405c807c6d8962269067664cae0))
* **tasks:** add custom fields and sprint points ([#42](https://github.com/Cadenway/cadenway-task-service/issues/42)) ([59d4d0e](https://github.com/Cadenway/cadenway-task-service/commit/59d4d0e9fdf9710b0dde7a075e6531881ab58b73))
* **tasks:** add goals and key results ([#45](https://github.com/Cadenway/cadenway-task-service/issues/45)) ([446d8c3](https://github.com/Cadenway/cadenway-task-service/commit/446d8c39418df304facceede0e8822dce83b7ea9))
* **tasks:** add planning, duplication and bulk actions ([#39](https://github.com/Cadenway/cadenway-task-service/issues/39)) ([5cfd937](https://github.com/Cadenway/cadenway-task-service/commit/5cfd93787b1425757a2e78d20677a4ababa5524f))
* **tasks:** add private onboarding state and presets ([#44](https://github.com/Cadenway/cadenway-task-service/issues/44)) ([44593f3](https://github.com/Cadenway/cadenway-task-service/commit/44593f3dab394de6ad8efd7fbbeaaab2076850b0))
* **tasks:** add sprint reports and team dashboard ([#46](https://github.com/Cadenway/cadenway-task-service/issues/46)) ([71db07f](https://github.com/Cadenway/cadenway-task-service/commit/71db07f7b66c3cf18e5aa43006066c5645c896b0))
* **tasks:** add task approval rounds ([#43](https://github.com/Cadenway/cadenway-task-service/issues/43)) ([b2cd127](https://github.com/Cadenway/cadenway-task-service/commit/b2cd127e2496a33b5811b153965934dc5362bef2))
* **tasks:** add tasks, subtasks, checklists and activity logs ([#30](https://github.com/Cadenway/cadenway-task-service/issues/30)) ([e8e41ae](https://github.com/Cadenway/cadenway-task-service/commit/e8e41aeec253c9161c422e67467bdd711378ffac))
* **tasks:** add the task library and private favorites ([#40](https://github.com/Cadenway/cadenway-task-service/issues/40)) ([9f02eb5](https://github.com/Cadenway/cadenway-task-service/commit/9f02eb56bd43c5994308d158dfaa8a9a79707408))
* **tasks:** add the task queries, the overview, the list counts and Home ([#31](https://github.com/Cadenway/cadenway-task-service/issues/31)) ([fafcaf0](https://github.com/Cadenway/cadenway-task-service/commit/fafcaf061e83bf208382e653ed5c198805992b5d))
* **tasks:** apply authorized Git status actions ([#56](https://github.com/Cadenway/cadenway-task-service/issues/56)) ([9e9b8df](https://github.com/Cadenway/cadenway-task-service/commit/9e9b8dfca8f739529bb44e6d8b8f2fc668f179d1))
* **tasks:** apply delegated automation actions ([#57](https://github.com/Cadenway/cadenway-task-service/issues/57)) ([7a908cb](https://github.com/Cadenway/cadenway-task-service/commit/7a908cb5fa04c0d8b573a0016eff2bfc82540f49))
* **tasks:** authorize notification subjects and deliveries ([#51](https://github.com/Cadenway/cadenway-task-service/issues/51)) ([e179fb5](https://github.com/Cadenway/cadenway-task-service/commit/e179fb578060c9766b98f805fdc3131c1f069f69))
* **tasks:** authorize task attachment operations ([#50](https://github.com/Cadenway/cadenway-task-service/issues/50)) ([0c97c50](https://github.com/Cadenway/cadenway-task-service/commit/0c97c509f10a556edc598f4e8e4887d0d72462de))
* **tasks:** delegate automation comments and notification access ([#58](https://github.com/Cadenway/cadenway-task-service/issues/58)) ([e19a508](https://github.com/Cadenway/cadenway-task-service/commit/e19a508fbedb13ce550069ec1e370b0b5690a46c))
* **tasks:** expose authoritative search evidence ([#55](https://github.com/Cadenway/cadenway-task-service/issues/55)) ([859f321](https://github.com/Cadenway/cadenway-task-service/commit/859f3214da4a15fec7521d12d9709a90bd32eb79))
* **tasks:** publish list intake forms ([#48](https://github.com/Cadenway/cadenway-task-service/issues/48)) ([fff89c6](https://github.com/Cadenway/cadenway-task-service/commit/fff89c67de7a5522a6673e8267a43cb024c5c1f3))
* **tasks:** record work logs and elapsed status history ([#41](https://github.com/Cadenway/cadenway-task-service/issues/41)) ([5c83164](https://github.com/Cadenway/cadenway-task-service/commit/5c831641e6c551a03f569904641b1587443cb9b0))
* **tasks:** return stable identifiers from realtime access checks ([#52](https://github.com/Cadenway/cadenway-task-service/issues/52)) ([bcbe461](https://github.com/Cadenway/cadenway-task-service/commit/bcbe461b87cba0b2f5e6d26da915ee11ead38703))
* **tasks:** stream bounded CSV projections ([#47](https://github.com/Cadenway/cadenway-task-service/issues/47)) ([a1ff9d1](https://github.com/Cadenway/cadenway-task-service/commit/a1ff9d1c40956fcc08d1c1afd50faaba1512e029))
* **trash:** trash, restore and erase tasks, and delete lists and spaces ([#34](https://github.com/Cadenway/cadenway-task-service/issues/34)) ([8e2582c](https://github.com/Cadenway/cadenway-task-service/commit/8e2582ca3adbab7108db7140e32b31fb74292c8e))


### Bug Fixes

* **outbox:** check relay database privileges in readiness ([#62](https://github.com/Cadenway/cadenway-task-service/issues/62)) ([744d2c2](https://github.com/Cadenway/cadenway-task-service/commit/744d2c2c6ec6887111bf33b4a1a5cb4c3ec6b88e))
* **recovery:** rebuild task memberships before database cutover ([#60](https://github.com/Cadenway/cadenway-task-service/issues/60)) ([49fcbb2](https://github.com/Cadenway/cadenway-task-service/commit/49fcbb2e051bfe81249e8e82e377435016acde94))
* **security:** harden task membership, replay and trash processing ([#59](https://github.com/Cadenway/cadenway-task-service/issues/59)) ([e376963](https://github.com/Cadenway/cadenway-task-service/commit/e376963be5483ebeade8a47e8d7ecfe492b6a0c1))
* **task:** preserve UTF-8 CSV stream backpressure ([#49](https://github.com/Cadenway/cadenway-task-service/issues/49)) ([4146d9d](https://github.com/Cadenway/cadenway-task-service/commit/4146d9d8e8a8fb153d601462da431ef8ea7a97d2))
* **trash:** follow one global lock order and check access again under the locks ([#35](https://github.com/Cadenway/cadenway-task-service/issues/35)) ([21df43b](https://github.com/Cadenway/cadenway-task-service/commit/21df43b0994308089d947d34836196783b5ea1ba))
* **trash:** serialize subtree writes and bound purge transactions ([#36](https://github.com/Cadenway/cadenway-task-service/issues/36)) ([95290b3](https://github.com/Cadenway/cadenway-task-service/commit/95290b35df420295a1126651a12d7417f2d146fe))

## [0.3.0](https://github.com/Cadenway/cadenway-task-service/compare/v0.2.0...v0.3.0) (2026-11-16)


### Features

* wire messaging and the outbox onto nest-common 0.3.0 ([#19](https://github.com/Cadenway/cadenway-task-service/issues/19)) ([0d9fdc3](https://github.com/Cadenway/cadenway-task-service/commit/0d9fdc3313690a0cdaa5343e6006e5ee4d157229))


### Bug Fixes

* **deploy:** keep the migrator url out of the running service ([#22](https://github.com/Cadenway/cadenway-task-service/issues/22)) ([c560ed2](https://github.com/Cadenway/cadenway-task-service/commit/c560ed2ee645d9ea0093437c8545fb805ff44d16))
* **dev:** keep the application role out of the drizzle schema ([#21](https://github.com/Cadenway/cadenway-task-service/issues/21)) ([039422d](https://github.com/Cadenway/cadenway-task-service/commit/039422d84b03293bd631b13706eda2f78a6c4c08))

## [0.2.0](https://github.com/Cadenway/cadenway-task-service/compare/v0.1.0...v0.2.0) (2026-11-15)


### Features

* wire the service onto the published service kit ([#16](https://github.com/Cadenway/cadenway-task-service/issues/16)) ([3c54c3a](https://github.com/Cadenway/cadenway-task-service/commit/3c54c3afe7ea5f74306ea80f93431918da92721b))

## 0.1.0 (2026-11-12)


### Bug Fixes

* **deploy:** sign the deploy commits with the bot's noreply address ([#3](https://github.com/Cadenway/cadenway-task-service/issues/3)) ([101b54f](https://github.com/Cadenway/cadenway-task-service/commit/101b54fd24cc98405ddcc1f41b2e83234a8cbd6d))
