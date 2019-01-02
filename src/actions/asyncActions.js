import {push} from 'connected-react-router';
export function getTasks(userToken,forceUpdate) {
    return (dispatch,getState) => {
        var {tasks} = getState();
        //利用缓存，forceUpdae:强制请求
        if(!forceUpdate && tasks) {
            return;
        }
        fetch('http://localhost:8082/tasks', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${userToken}`
            }
        }).then(res => {
            if (res.status == 401) {
                throw new Error(401)
            }
            return res.json()
        }).then(data => {
            dispatch({ type: 'SAVETASKS', tasks: data.data })
        }).catch(e => {
            dispatch({ type: 'REMOVEUSER' })
            if (e.message == 401) {
                this.props.history.push('/login');
            }
        })
    }
}
export function logout() {
    return (dispatch,getState) => {
        dispatch({type:'REMOVEUSER'});
        dispatch(push('/login'))
    }
}
export function login(username,userToken) {
    return (dispatch,getState) => {
        // dispatch({type:'SAVEUSER',username,userToken})
        dispatch(push('/'))
    }
}