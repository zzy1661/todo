const Utils = {
    dateFormat (date, formatStr) {
        let o = {
            Y: date.getFullYear(),
            M: date.getMonth() + 1,
            D: date.getDate(),
            H: date.getHours(),
            m: date.getMinutes(),
            S: date.getSeconds()
        };
        for (let i in o) {
            if (o.hasOwnProperty(i)) {
                if (o[i] < 10) {
                    o[i] = '0' + o[i];
                }
            }
        }
        formatStr = formatStr || 'yyyy/MM/dd HH:mm:ss';
        var reg = new RegExp('[Yy]+|M+|[Dd]+|[Hh]+|m+|[Ss]+', 'g');
        var regM = new RegExp('m');
        var regY = new RegExp('y', 'i');
        return formatStr.replace(reg, function(v) {
            var old = v;
            if (regM.test(v)) {
                old = o.m;
            } else if (regY.test(v)) {
                var y = '' + o.Y;
                var le = y.length - (v.length === 1 ? 2 : v.length);
                old = y.substring(y.length, le)
            } else {
                var key = v.toUpperCase().substr(0, 1);
                old = o[key];
            }
            return old;
        });
    }
}
export default Utils;