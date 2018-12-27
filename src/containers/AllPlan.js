import { connect } from 'react-redux';
import AllPlan from '../components/AllPlan';
import {getTasks} from '../actions/asyncActions';
const mapStateToProps = (state) => {
    return {
        username: state.username,
        userToken: state.userToken,
        tasks: state.tasks
    }
}
const mapDispatchToProps = (dispatch) => {
    return {
        removeUser: (username, userToken) => {          
            dispatch({ type: 'logout'});
        },
        getTasks: (token) => {
            return dispatch(getTasks(token));
        }
    }
}
export default connect(mapStateToProps, mapDispatchToProps)(AllPlan)