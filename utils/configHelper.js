// utils/configHelper.js
const db = require('../db/connection');

// 缓存配置
let configCache = {};
let cacheTime = 0;
const CACHE_TTL = 60000; // 缓存1分钟

// 获取配置值
async function getConfig(key, defaultValue = null) {
    try {
        // 检查缓存
        if (Date.now() - cacheTime < CACHE_TTL && configCache[key] !== undefined) {
            return configCache[key];
        }

        const result = await db.query(
            'SELECT config_value, config_type FROM system_config WHERE config_key = $1',
            [key]
        );

        if (result.rows.length === 0) {
            return defaultValue;
        }

        const config = result.rows[0];
        let value = config.config_value;

        // 类型转换
        if (config.config_type === 'number') {
            value = parseFloat(value);
        } else if (config.config_type === 'boolean') {
            value = value === 'true';
        } else if (config.config_type === 'json') {
            value = JSON.parse(value);
        }

        // 更新缓存
        configCache[key] = value;
        cacheTime = Date.now();

        return value;
    } catch (error) {
        console.error('Get config error:', error);
        return defaultValue;
    }
}

// 清除缓存
function clearCache() {
    configCache = {};
    cacheTime = 0;
}

module.exports = { getConfig, clearCache };