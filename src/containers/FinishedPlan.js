import { connect } from 'react-redux';
import FinishedPlan from '../components/FinishedPlan';
import { getTasks, logout } from '../actions/commonActions';

const mapStateToProps = (state) => {
    return {
        router: state.router,
        ...state.user,
        ...state.task
    }
}
const mapDispatchToProps = (dispatch) => {
    return {
        removeUser: () => {
            dispatch(logout());
        },
        getTasks: (token) => { 
             return dispatch(getTasks(token));
        },
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(FinishedPlan)