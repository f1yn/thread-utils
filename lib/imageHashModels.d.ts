import { Sequelize, Model, Optional } from 'sequelize';
interface ImageAttributes {
    id: number;
    bytes: number;
    hash: string;
    path: string;
    processed: boolean;
    groupId?: number;
}
interface ImageCreateAttributes extends Optional<ImageAttributes, 'id'> {
}
export interface ImageInstance extends Model<ImageAttributes, ImageCreateAttributes>, ImageAttributes {
}
interface GroupAttributes {
    id: number;
}
interface GroupCreateAttributes extends Optional<GroupAttributes, 'id'> {
}
export interface GroupInstance extends Model<GroupAttributes, GroupCreateAttributes>, GroupAttributes {
    images?: ImageInstance[];
}
export declare function connectAndBuildModels(): Promise<{
    sequelize: Sequelize;
    Image: import("sequelize").ModelCtor<ImageInstance>;
    Group: import("sequelize").ModelCtor<GroupInstance>;
}>;
export declare function syncModels(): Promise<{
    sequelize: Sequelize;
    Image: import("sequelize").ModelCtor<ImageInstance>;
    Group: import("sequelize").ModelCtor<GroupInstance>;
}>;
export {};
