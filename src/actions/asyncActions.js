export function getTasks(userToken) {
    return (dispatch) => {
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
            dispatch({ type: 'saveTasks', tasks: data.data })
        }).catch(e => {
            dispatch({ type: 'logout' })
            if (e.message == 401) {
                this.props.history.push('/login');
            }
        })
    }
}
