import React, { Component } from 'react';
import { connect } from 'dva';
import General from '../components/General';
import AllTasksPage from './AllTasksPage';
import FinishedTasksPage from './FinishedTasksPage';
import TodoTasksPage from './TodoTasksPage';
import { NavLink, Route, Switch, Redirect, withRouter } from "dva/router";

// const GeneralPage = ({ dispatch, user}) =>
class GeneralPage extends Component {

    // componentDidMount() {
    //     console.log('general page mounted')
    //     const { dispatch, user} = this.props;
    //     dispatch({
    //         type:'tasks/getTasks',
    //         payload: {
    //             userToken: user.userToken
    //         }
    //     })
    // }
    
    render() {
        return (
            <General>
                <Switch>
                <Redirect exact from="/general" to="/general/all"></Redirect>
                <Route path="/general/all" component={AllTasksPage}></Route>
                <Route path="/general/finished" component={FinishedTasksPage}></Route>
                <Route path="/general/todo" component={TodoTasksPage}></Route>
              </Switch>
            </General>
        )    
    }
    
    
}
  
  // export default Products;
  export default connect(({ user }) => ({
    user,
  }))(GeneralPage);