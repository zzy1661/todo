import { connect } from 'react-redux';
import AllPlan from '../components/AllPlan';
import { getTasks, logout } from '../actions/asyncActions';
import { push, replace } from 'react-router-redux'

const mapStateToProps = (state) => {
    return {
        router: state.router,
        ...state.user,
        ...state.task
    }
}
const mapDispatchToProps = (dispatch) => {
    return {
        test: () => {
            console.log('push login')
            dispatch(push('/login'));
        },
        removeUser: (username, userToken) => {
            dispatch(logout());
        },
        getTasks: (token) => { 
             return dispatch(getTasks(token));
        },
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(AllPlan)