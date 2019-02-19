import React from 'react';
import { connect } from 'dva';
import FinishedTasks from '../components/FinishedTasks';

const FinishedTasksPage = ({ dispatch, user}) => {


    return (
        <FinishedTasks>
           
        </FinishedTasks>
    )
}
  
  // export default Products;
  export default connect(({ user }) => ({
    user,
  }))(FinishedTasksPage);