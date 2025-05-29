import {
    InstanceBase,
    runEntrypoint,
    InstanceStatus
} from "@companion-module/base";
import { UpgradeScripts } from "./upgrades";
import { Config, configFields } from "./config";
import { ActionFactory } from "./actions";
import { UpdateFeedbacks } from "./feedbacks";
import { UpdateVariables } from "./variables";
import { GRPCClient } from "./grpc/grpcclient";
import { startDiscovery } from "./utils";
import { MacroRepository } from "./dmxcstate/macro/macrorepository";
import { PresetsManager } from "./presets";
import { ExecutorRepository } from "./dmxcstate/executor/executorrepository";
import { randomUUID } from "crypto";

type DMXCRepository = MacroRepository | ExecutorRepository;

export class DMXCModuleInstance extends InstanceBase<Config> {
    public config?: Config;

    public UmbraClient?: GRPCClient;

    public actions?: ActionFactory;

    public repositories?: Map<string, DMXCRepository>;

    public presets?: PresetsManager;

    public runtimeid: string = "";

    async init(config: Config) {
        this.config = config;

        this.runtimeid = randomUUID().toString();

        this.updateStatus(InstanceStatus.Connecting);

        this.actions = new ActionFactory(this);
        this.repositories = new Map<string, DMXCRepository>();
        this.repositories.set("MacroRepository", new MacroRepository());
        this.repositories.set("ExecutorRepository", new ExecutorRepository());
        this.presets = new PresetsManager(this);

        this.updateActions(); // export actions
        this.updateFeedbacks(); // export feedbacks
        this.updateVariableDefinitions(); // export variable definitions

        if (config.disablediscovery) {
            this.UmbraClient = new GRPCClient(
                config.host,
                config.port,
                config.devicename,
                this
            );
            this.UmbraClient.login(
                config.netid,
                this,
                () => {
                    this.updateStatus(InstanceStatus.Disconnected);
                },
                () => {
                    this.updateStatus(InstanceStatus.ConnectionFailure);
                }
            );
        } else {
            startDiscovery(
                config,
                this,
                (client, config) => {
                this.UmbraClient = client;
                this.saveConfig(config);
            }
                () => {
                    this.errorhandler();
                }
            );
        }

        return Promise.resolve();
    }

    errorhandler(): void {
        this.updateStatus(InstanceStatus.Disconnected);
        if (this.UmbraClient) {
            this.UmbraClient.destroy(this);
        }
        if (this.config) {
            startDiscovery(
                this.config,
                this,
                (client) => {
                    this.UmbraClient = client;
                },
                () => {
                    this.errorhandler();
                }
            );
        }
    }

    async destroy(): Promise<void> {
        this.log("debug", "destroy");
        this.UmbraClient?.destroy(this);
        return Promise.resolve();
    }

    async configUpdated(config: Config): Promise<void> {
        this.config = config;
        return Promise.resolve();
    }

    getConfigFields() {
        return configFields();
    }

    updateActions() {
        this.actions?.updateActions();
    }

    updateFeedbacks() {
        UpdateFeedbacks(this);
    }

    updateVariableDefinitions() {
        UpdateVariables(this);
    }
}

runEntrypoint(DMXCModuleInstance, UpgradeScripts());
