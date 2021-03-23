import { Sequelize } from 'sequelize';
export declare function connectAndBuildModels(): Promise<{
    sequelize: Sequelize;
    Image: import("sequelize").ModelCtor<import("sequelize").Model<any, any>>;
    Group: import("sequelize").ModelCtor<import("sequelize").Model<any, any>>;
}>;
export declare function syncModels(): Promise<{
    sequelize: Sequelize;
    Image: import("sequelize").ModelCtor<import("sequelize").Model<any, any>>;
    Group: import("sequelize").ModelCtor<import("sequelize").Model<any, any>>;
}>;
